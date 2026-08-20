import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { CommuteEvent } from 'interfaces';
import { getWebsocketServerInstance } from '../../services/websocket';
import { setupSSEResponse, writeSSEData, endSSEResponse } from '../../utils/sse';
import { validateChatCompletions } from '../../middlewares/validation';
import { sseRouter } from './sse.v1';

const chatRouter = Router();

// Mount /v1/chat/sse under chatRouter
chatRouter.use('/sse', sseRouter);

interface MessageContentText {
  type: 'text';
  text: string;
}
interface MessageContentImage {
  type: 'image_url';
  image_url: { url: string };
}
type MessageContent = MessageContentText | MessageContentImage;
interface Message {
  content: MessageContent[] | string;
  role?: string;
}

chatRouter.post('/completions', validateChatCompletions, async (req: Request, res: Response) => {
  const { messages, outputFormat: rawOutputFormat, stream, model: clientModel } = req.body as {
    messages: Message[];
    outputFormat?: string;
    stream?: boolean;
    model?: string;
  };

  const outputFormat = rawOutputFormat || 'markdown';
  const model = clientModel || 'gpt-auto';

  if (stream) {
    setupSSEResponse(res);
  }

  const processedMessages = messages.map((msg) => {
    if (Array.isArray(msg.content)) {
      const text =
        (msg.content.find((i) => i.type === 'text') as MessageContentText | undefined)?.text ?? '';
      const image =
        (msg.content.find((i) => i.type === 'image_url') as MessageContentImage | undefined)
          ?.image_url?.url ?? '';
      return image ? `${text}\n[Image: ${image}]` : text;
    }
    return typeof msg.content === 'string' ? msg.content : '';
  });

  let requestPayload = processedMessages.join('\n\n');
  const MAX_PAYLOAD_LEN = 50_000;
  if (requestPayload.length > MAX_PAYLOAD_LEN) {
    requestPayload = requestPayload.slice(-MAX_PAYLOAD_LEN);
  }

  const uuid = randomUUID();
  const socketPayload = {
    type: CommuteEvent.Chat,
    data: {
      uuid,
      text: requestPayload,
      outputFormat,
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

  wsServer.sendRequest(socketPayload, (type, response, sourceUuid) => {
    if (responseFinished) return;

    try {
      const fullText = (response || '').trim();
      const deltaText = fullText.slice(prevTextLen);
      prevTextLen = fullText.length;

      let renderedContent: unknown;
      if (outputFormat === 'json') {
        try {
          renderedContent = JSON.parse(fullText);
        } catch {
          renderedContent = { text: fullText };
        }
      } else {
        renderedContent = { text: fullText };
      }

      if (type === 'stop' && sourceUuid === uuid) {
        responseFinished = true;
        res.off('close', handleClientDisconnect);

        if (stream) {
          if (deltaText) {
            writeSSEData(
              res,
              {
                id: `chatcmpl-${uuid}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: { content: deltaText },
                    finish_reason: null,
                  },
                ],
              },
              ''
            );
          }
          // Send final finish_reason block
          writeSSEData(
            res,
            {
              id: `chatcmpl-${uuid}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: 'stop',
                },
              ],
            },
            ''
          );
          endSSEResponse(res, '');
        } else {
          res.json({
            id: `chatcmpl-${uuid}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: fullText,
                },
                finish_reason: 'stop',
              },
            ],
            data: renderedContent,
          });
        }
      } else if (stream && deltaText) {
        writeSSEData(
          res,
          {
            id: `chatcmpl-${uuid}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: { content: deltaText },
                finish_reason: null,
              },
            ],
          },
          ''
        );
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Chat API] Error in WS callback:', errorMessage);
      if (!responseFinished) {
        responseFinished = true;
        res.off('close', handleClientDisconnect);
        if (stream) {
          endSSEResponse(res, '');
        } else {
          res.status(500).json({ error: errorMessage || 'Internal server error' });
        }
      }
    }
  });
});

export { chatRouter };