import { Router, Request, Response } from 'express';
import { websocketServerInstance } from '../../services/websocket';

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

chatRouter.post('/completions', async (req: Request, res: Response) => {
  const { messages, outputFormat, stream, newChat = true } = req.body as {
    messages: Message[];
    outputFormat: string;
    stream?: boolean;
    newChat?: boolean;
  };

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof (res as Response & { flushHeaders?: () => void }).flushHeaders === 'function') {
      (res as Response & { flushHeaders: () => void }).flushHeaders();
    }
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

  const requestPayload = `
Now you must play the role of system and answer the user.

${JSON.stringify(processedMessages, null, 2)}

Your answer:
`;

  let lastResponse = '';

  websocketServerInstance.sendRequest(
    { text: requestPayload, outputFormat, newChat },
    (type, response) => {
      try {
        response = response.trim();

        const delta =
          lastResponse && response.startsWith(lastResponse)
            ? response.slice(lastResponse.length)
            : response;

        let renderedContent: any;
        if (outputFormat === 'json') {
          // Try to parse response as JSON, fallback to string
          try {
            renderedContent = JSON.parse(response);
          } catch {
            renderedContent = { content: response };
          }
        } else if (outputFormat === 'plain') {
          renderedContent = response;
        } else if (outputFormat === 'markdown') {
          renderedContent = response; // If markdown, just pass as string (client will render)
        } else {
          renderedContent = response;
        }

        const result = {
          choices: [
            {
              message: { content: renderedContent },
              delta: { content: delta },
            },
          ],
        };

        lastResponse = response;

        if (type === 'stop') {
          if (stream) {
            (res as Response & NodeJS.WritableStream).write(`id: ${Date.now()}\n`);
            (res as Response & NodeJS.WritableStream).write(`event: event\n`);
            (res as Response & NodeJS.WritableStream).write(`data: [DONE]\n\n`);
            (res as Response & NodeJS.WritableStream).end();
          } else {
            res.json(result);
          }
        } else if (stream) {
          (res as Response & NodeJS.WritableStream).write(`id: ${Date.now()}\n`);
          (res as Response & NodeJS.WritableStream).write(`event: event\n`);
          (res as Response & NodeJS.WritableStream).write(`data: ${JSON.stringify(result)}\n\n`);
        }
      } catch (err) {
        console.error(err);
      }
    }
  );
});

export { chatRouter };
