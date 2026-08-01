import { Router, Request, Response } from 'express';
import { getWebsocketServerInstance } from '../../services/websocket';
import { CommuteEvent } from "interfaces"
import { setupSSEResponse, writeSSEData, endSSEResponse } from '../../utils/sse';
import { validateChatCompletions } from '../../middlewares/validation';
import { randomUUID } from 'crypto';


const chatRouter = Router();

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
}

chatRouter.post('/completions', validateChatCompletions, async (req: Request, res: Response) => {
  const { messages, outputFormat, stream } = req.body as {
    messages: Message[];
    outputFormat: string;
    stream?: boolean;
  };

  if (stream) {
    setupSSEResponse(res);
  }

  const processedMessages = messages.map((msg) => {
    if (Array.isArray(msg.content)) {
      const text =
        (msg.content.find((i) => i.type === 'text') as MessageContentText | undefined)?.text ?? '';
      const image =
        (msg.content.find((i) => i.type === 'image_url') as MessageContentImage | undefined)?.image_url?.url ?? '';
      return image ? `${text}\n[Image: ${image}]` : text;
    }
    return msg.content;
  });

  const requestPayload = `${processedMessages}`;

  let responseFinished = false;
  let lastResponse = '';

  const uuid = randomUUID();
  const socketPayload = {
    type: CommuteEvent.Chat,
    data: {
      uuid: uuid,
      text: requestPayload,
      outputFormat,
    }
  }

  const wsServer = getWebsocketServerInstance();

  // If the HTTP client disconnects before we finish, cancel the in-flight
  // request instead of letting it sit until the WS-side timeout fires —
  // this keeps least-busy connection selection accurate for future requests.
  const handleClientDisconnect = () => {
    if (!responseFinished) {
      responseFinished = true;
      wsServer.cancelRequest(uuid);
    }
  };
  res.on('close', handleClientDisconnect);

  wsServer.sendRequest(
    socketPayload,
    (type, response, sourceUuid) => {
      if (responseFinished) return;
      try {
        response = response.trim();

        let renderedContent: any;
        if (outputFormat === 'json') {
          // Try to parse response as JSON, fallback to string
          try {
            renderedContent = JSON.parse(response);
          } catch {
            renderedContent = { text: response };
          }
        } else {
          renderedContent = { text: response };
        }

        const result = {
          data: renderedContent,
        };

        lastResponse = response;

        if (type === 'stop' && sourceUuid == uuid) {
          responseFinished = true;
          res.off('close', handleClientDisconnect);
          if (stream) {
            endSSEResponse(res);
          } else {
            res.json(result);
          }
        } else if (stream) {
          writeSSEData(res, result);
        }
      } catch (err) {
        console.error('Error in WS callback:', err);
        if (!responseFinished) {
          responseFinished = true;
          res.off('close', handleClientDisconnect);
          if (stream) {
            endSSEResponse(res);
          } else {
            res.status(500).json({ error: 'Internal server error' });
          }
        }
      }
    }
  );
});

export { chatRouter };