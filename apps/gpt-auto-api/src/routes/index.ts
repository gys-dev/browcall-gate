import { Router } from 'express';
import { chatRouter } from './api/chat.v1';
import { sseRouter } from './api/sse.v1';
import { messagesRouter } from './api/messages.v1';

const router = Router();

// Live rendering SSE endpoints
router.use('/sse', sseRouter);
router.use('/v1/sse', sseRouter);

// Anthropic Messages API (Claude Code)
router.use('/v1/messages', messagesRouter);

// OpenAI Chat Completions API & /v1/chat/sse
router.use('/v1/chat', chatRouter);

export default router;