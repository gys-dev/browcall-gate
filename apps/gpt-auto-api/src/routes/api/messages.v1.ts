import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { CommuteEvent } from 'interfaces';
import { getWebsocketServerInstance } from '../../services/websocket';
import { setupSSEResponse, writeAnthropicEvent } from '../../utils/sse';
import { logClaudeMessage, logClaudeRequest } from '../../utils/claude-message-csv';

const messagesRouter = Router();

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | AnthropicContentBlock[];
}

function getContentText(content: string | AnthropicContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content.map((block) => block.text || '').join('\n');
}

function getSystemText(system: string | AnthropicContentBlock[] | undefined): string {
  if (!system) return '';
  return getContentText(system);
}

function getRequestType(systemPrompt: string, model: string): string {
  const normalized = systemPrompt.toLowerCase();

  if (
    normalized.includes('new conversation topic') ||
    normalized.includes('extract a 2-3 word title')
  ) {
    return 'topic_classifier';
  }

  if (model.toLowerCase().includes('haiku') && normalized.includes('topic')) {
    return 'topic_classifier';
  }

  return 'agent';
}

messagesRouter.post('/', async (req: Request, res: Response) => {
  const {
    messages,
    model: clientModel,
    stream = true,
    system,
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

  const model = clientModel || 'claude-3-5-sonnet';
  const msgId = `msg_${randomUUID().replace(/-/g, '').substring(0, 20)}`;
  const uuid = randomUUID();
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const outputFormat = 'markdown';

  const systemContent = getSystemText(system);
  const messagesToLog = messages.map((message, index) => ({
    role: message.role,
    content: getContentText(message.content),
    contentType: typeof message.content === 'string' ? 'text' : 'content_blocks',
    messageIndex: index,
  }));

  if (systemContent) {
    messagesToLog.unshift({
      role: 'system',
      content: systemContent,
      contentType: typeof system === 'string' ? 'text' : 'content_blocks',
      messageIndex: -1,
    });
  }

  // Keep the raw per-message log for detailed inspection.
  await Promise.all(
    messagesToLog.map((message) =>
      logClaudeMessage({
        timestamp,
        requestId: uuid,
        model,
        stream,
        messageIndex: message.messageIndex,
        role: message.role,
        contentType: message.contentType,
        contentLength: message.content.length,
        content: message.content,
      }),
    ),
  );

  const userMessages = messages.filter((message) => message.role === 'user');
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  const lastUserMsg = [...messages].reverse().find((message) => message.role === 'user');
  const lastUserText = lastUserMsg ? getContentText(lastUserMsg.content) : '';
  const totalInputLength = systemContent.length + messagesToLog.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  const requestType = getRequestType(systemContent, model);
  const outputConfigType = req.body.output_config?.format?.type || '';

  if (req.body.output_config?.format?.type === 'json_schema') {
    void logClaudeRequest({
      timestamp,
      requestId: uuid,
      model,
      stream,
      requestType,
      totalMessages: messages.length,
      systemPromptLength: systemContent.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      totalInputLength,
      lastUserMessageLength: lastUserText.length,
      forwardedPayloadLength: 0,
      forwardedOnlyLastUser: false,
      outputConfigType,
      status: 'completed_json_schema',
      responseLength: 0,
      durationMs: Date.now() - startedAt,
      lastUserPreview: lastUserText.slice(0, 500),
    });

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
    return;
  }

  // The browser keeps the Claude conversation context. On the first request
  // for a browser connection it receives system (-1) + message 0; subsequent
  // requests only need the latest user message.
  const initialUserMsg = messages[0];
  const initialUserText = initialUserMsg ? getContentText(initialUserMsg.content) : '';
  const requestPayload = lastUserText || messages.map((msg) => `${msg.role}: ${getContentText(msg.content)}`).join('\n\n');

  // Request markdown format so browser extension extracts raw markdown for Claude CLI.
  // The WebSocket server decides whether the initial context is still needed
  // based on the browser connection's session state.
  const socketPayload = {
    type: CommuteEvent.Chat,
    data: {
      uuid,
      text: requestPayload,
      initialContext: {
        system: systemContent,
        initialUser: initialUserText,
      },
      outputFormat,
    },
  };

  const wsServer = getWebsocketServerInstance();
  let responseFinished = false;
  let prevTextLen = 0;

  const writeRequestAnalysis = (status: string, responseLength: number) => {
    void logClaudeRequest({
      timestamp,
      requestId: uuid,
      model,
      stream,
      requestType,
      totalMessages: messages.length,
      systemPromptLength: systemContent.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      totalInputLength,
      lastUserMessageLength: lastUserText.length,
      forwardedPayloadLength: requestPayload.length,
      forwardedOnlyLastUser: Boolean(lastUserMsg) && messages.length > 1,
      outputConfigType,
      status,
      responseLength,
      durationMs: Date.now() - startedAt,
      lastUserPreview: lastUserText.slice(0, 500),
    });
  };

  const handleClientDisconnect = () => {
    if (!responseFinished) {
      responseFinished = true;
      wsServer.cancelRequest(uuid);
      writeRequestAnalysis('cancelled', prevTextLen);
    }
  };
  res.on('close', handleClientDisconnect);

  if (stream) {
    setupSSEResponse(res);

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

    writeAnthropicEvent(res, 'content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });
  }

  wsServer.sendRequest(socketPayload, (type, response, sourceUuid) => {
    if (responseFinished) return;

    try {
      const fullText = (response || '').trim();
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
        writeRequestAnalysis('completed', fullText.length);

        if (stream) {
          if (deltaText) {
            writeAnthropicEvent(res, 'content_block_delta', {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: deltaText },
            });
          }

          writeAnthropicEvent(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
          writeAnthropicEvent(res, 'message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: fullText.length },
          });
          writeAnthropicEvent(res, 'message_stop', { type: 'message_stop' });
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
        writeRequestAnalysis('error', prevTextLen);

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
