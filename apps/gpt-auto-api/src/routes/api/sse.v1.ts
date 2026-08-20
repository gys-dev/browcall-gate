import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { CommuteEvent } from 'interfaces';
import { getWebsocketServerInstance } from '../../services/websocket';
import { setupSSEResponse, writeSSEData, endSSEResponse } from '../../utils/sse';

const sseRouter = Router();

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

function parsePromptAndMessages(req: Request): {
  promptText: string;
  outputFormat: string;
  agentFormat: string;
} {
  let messagesInput: Message[] = [];
  let promptInput = '';

  const outputFormat =
    (req.query.outputFormat as string) || (req.body?.outputFormat as string) || 'markdown';
  const agentFormat =
    (req.query.agentFormat as string) || (req.body?.agentFormat as string) || 'raw';

  if (req.body?.messages && Array.isArray(req.body.messages)) {
    messagesInput = req.body.messages;
  } else if (req.query.messages) {
    try {
      const parsed = JSON.parse(req.query.messages as string);
      if (Array.isArray(parsed)) messagesInput = parsed;
    } catch {
      promptInput = req.query.messages as string;
    }
  }

  if (req.body?.prompt && typeof req.body.prompt === 'string') {
    promptInput = req.body.prompt;
  } else if (req.query.prompt && typeof req.query.prompt === 'string') {
    promptInput = req.query.prompt;
  } else if (req.query.q && typeof req.query.q === 'string') {
    promptInput = req.query.q;
  }

  let processedMessages: string[] = [];

  if (messagesInput.length > 0) {
    processedMessages = messagesInput.map((msg) => {
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
  } else if (promptInput) {
    processedMessages = [promptInput];
  }

  return {
    promptText: processedMessages.join('\n\n'),
    outputFormat,
    agentFormat,
  };
}

async function handleSSERequest(req: Request, res: Response) {
  const { promptText, outputFormat, agentFormat } = parsePromptAndMessages(req);

  if (!promptText.trim()) {
    res.status(400).json({
      error: 'Invalid request: "prompt", "q", or "messages" parameter is required.',
    });
    return;
  }

  setupSSEResponse(res);

  const uuid = randomUUID();
  console.log(`[SSE Router] Initiating SSE request (${req.method} ${req.originalUrl}), uuid: ${uuid}`);

  const socketPayload = {
    type: CommuteEvent.Chat,
    data: {
      uuid,
      text: promptText,
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

  // Send initial SSE event notifying client connection is established
  writeSSEData(res, { uuid, status: 'started' }, 'connected', uuid);

  wsServer.sendRequest(socketPayload, (type, response, sourceUuid) => {
    if (responseFinished) return;

    try {
      const fullText = (response || '').trim();
      const deltaText = fullText.slice(prevTextLen);
      if (deltaText) {
        prevTextLen = fullText.length;
      }

      if (type === 'answer' && sourceUuid === uuid) {
        if (deltaText) {
          writeSSEData(
            res,
            {
              uuid,
              text: fullText,
              delta: deltaText,
              outputFormat,
              agentFormat,
            },
            'delta',
            uuid
          );
        }
      } else if (type === 'stop' && sourceUuid === uuid) {
        responseFinished = true;
        res.off('close', handleClientDisconnect);

        if (deltaText) {
          writeSSEData(
            res,
            {
              uuid,
              text: fullText,
              delta: deltaText,
              outputFormat,
              agentFormat,
            },
            'delta',
            uuid
          );
        }

        writeSSEData(
          res,
          {
            uuid,
            text: fullText,
            status: 'completed',
          },
          'stop',
          uuid
        );

        endSSEResponse(res);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[SSE Router] Error processing WS callback:', errorMessage);
      if (!responseFinished) {
        responseFinished = true;
        res.off('close', handleClientDisconnect);
        writeSSEData(
          res,
          { error: errorMessage || 'Internal SSE processing error' },
          'error',
          uuid
        );
        endSSEResponse(res);
      }
    }
  });
}

sseRouter.get('/', handleSSERequest);
sseRouter.post('/', handleSSERequest);

export { sseRouter };
