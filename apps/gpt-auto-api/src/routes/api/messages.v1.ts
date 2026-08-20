import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { CommuteEvent } from 'interfaces';
import { getWebsocketServerInstance } from '../../services/websocket';
import { setupSSEResponse, writeAnthropicEvent } from '../../utils/sse';

const messagesRouter = Router();

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | AnthropicContentBlock[];
}

messagesRouter.post('/', async (req: Request, res: Response) => {
  const {
    messages,
    model: clientModel,
    stream = true,
  } = req.body as {
    messages?: AnthropicMessage[];
    system?: string | AnthropicContentBlock[];
    model?: string;
    stream?: boolean;
  };
  

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'messages array is required and must not be empty',
      },
    });
    return;
  }

  

  console.log("init body: ", req.body)

  const model = clientModel || 'claude-3-5-sonnet';
  const msgId = `msg_${randomUUID().replace(/-/g, '').substring(0, 20)}`;
  const uuid = randomUUID();

  if (req.body.output_config?.format?.type === 'json_schema') {
    res.json({
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: JSON.stringify({ isNewTopic: false, title: null }) }],
      model: req.body.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    });
    return; // handle first message: naming topic so we skip it
  }

  // Extract user query, preventing giant payload overflow from whole directory dump
  const promptParts: string[] = [];
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUserMsg) {
    let text = '';
    if (typeof lastUserMsg.content === 'string') {
      text = lastUserMsg.content;
    } else if (Array.isArray(lastUserMsg.content)) {
      text = lastUserMsg.content.map((b) => b.text || '').join('\n');
    }
    promptParts.push(text);
  } else {
    for (const msg of messages) {
      let msgText = '';
      if (typeof msg.content === 'string') {
        msgText = msg.content;
      } else if (Array.isArray(msg.content)) {
        msgText = msg.content.map((b) => b.text || '').join('\n');
      }
      promptParts.push(`${msg.role}: ${msgText}`);
    }
  }

  let requestPayload = promptParts.join('\n\n');
  const MAX_PAYLOAD_LEN = 50_000;
  if (requestPayload.length > MAX_PAYLOAD_LEN) {
    requestPayload = requestPayload.slice(-MAX_PAYLOAD_LEN);
  }

  // Request markdown format so browser extension extracts raw markdown for Claude CLI
  const socketPayload = {
    type: CommuteEvent.Chat,
    data: {
      uuid,
      text: requestPayload,
      outputFormat: 'markdown',
    },
  };

  const wsServer = getWebsocketServerInstance();
  let responseFinished = false;
  let prevTextLen = 0;

  const handleClientDisconnect = () => {
    if (!responseFinished) {
      responseFinished = true;
      wsServer.cancelRequest(uuid);
    }
  };
  res.on('close', handleClientDisconnect);

  if (stream) {
    setupSSEResponse(res);

    // 1. message_start
    writeAnthropicEvent(res, 'message_start', {
      type: 'message_start',
      message: {
        id: msgId,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    });

    // 2. content_block_start
    writeAnthropicEvent(res, 'content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });
  }

  wsServer.sendRequest(socketPayload, (type, response, sourceUuid) => {
    if (responseFinished) return;

    try {
      const fullText = response || '';
      const deltaText = fullText.slice(prevTextLen);
      if (deltaText) {
        prevTextLen = fullText.length;
      }

      if (type === 'answer' && sourceUuid === uuid) {
        if (stream && deltaText) {
          writeAnthropicEvent(res, 'content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: deltaText },
          });
        }
      } else if (type === 'stop' && sourceUuid === uuid) {
        responseFinished = true;
        res.off('close', handleClientDisconnect);

        if (stream) {
          if (deltaText) {
            writeAnthropicEvent(res, 'content_block_delta', {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: deltaText },
            });
          }

          writeAnthropicEvent(res, 'content_block_stop', {
            type: 'content_block_stop',
            index: 0,
          });

          writeAnthropicEvent(res, 'message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: fullText.length },
          });

          writeAnthropicEvent(res, 'message_stop', {
            type: 'message_stop',
          });

          res.end();
        } else {
          res.json({
            id: msgId,
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: fullText }],
            model,
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
              input_tokens: requestPayload.length,
              output_tokens: fullText.length,
            },
          });
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Messages API] Error processing WS callback:', errorMessage);
      if (!responseFinished) {
        responseFinished = true;
        res.off('close', handleClientDisconnect);
        if (stream) {
          writeAnthropicEvent(res, 'error', {
            type: 'error',
            error: {
              type: 'api_error',
              message: errorMessage || 'Internal server error',
            },
          });
          res.end();
        } else {
          res.status(500).json({
            type: 'error',
            error: {
              type: 'api_error',
              message: errorMessage || 'Internal server error',
            },
          });
        }
      }
    }
  });
});

export { messagesRouter };
