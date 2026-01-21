import { Response } from 'express';

export function setupSSEResponse(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
    }
}

export function writeSSEData(res: Response, data: any, event = 'event') {
    res.write(`id: ${Date.now()}\n`);
    res.write(`event: ${event}\n`);
    res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
}

export function endSSEResponse(res: Response) {
    res.write(`id: ${Date.now()}\n`);
    res.write(`event: event\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
}
