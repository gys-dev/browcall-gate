import { Response } from 'express';

type FlushableResponse = Response & {
  flushHeaders?: () => void;
  flush?: () => void;
};

export function setupSSEResponse(res: Response) {
  const flushable = res as FlushableResponse;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof flushable.flushHeaders === 'function') {
    flushable.flushHeaders();
  }
}

export function writeSSEData(res: Response, data: unknown, event = 'message', id?: string) {
  const flushable = res as FlushableResponse;
  const eventId = id || `${Date.now()}`;
  res.write(`id: ${eventId}\n`);
  if (event) {
    res.write(`event: ${event}\n`);
  }
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const formattedData = payload
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n');
  res.write(`${formattedData}\n\n`);
  if (typeof flushable.flush === 'function') {
    flushable.flush();
  }
}

export function writeAnthropicEvent(res: Response, event: string, data: unknown) {
  const flushable = res as FlushableResponse;
  res.write(`event: ${event}\n`);
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`data: ${payload}\n\n`);
  if (typeof flushable.flush === 'function') {
    flushable.flush();
  }
}

export function endSSEResponse(res: Response, finalEvent = 'message') {
  // Instruct SSE EventSource client not to auto-reconnect on end
  res.write(`retry: 86400000\n\n`);
  res.write(`id: ${Date.now()}\n`);
  if (finalEvent) {
    res.write(`event: ${finalEvent}\n`);
  }
  res.write(`data: [DONE]\n\n`);
  res.end();
}
