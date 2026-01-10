import { Router } from 'express';
import { chatRouter } from './api/chat.v1';


const router = Router();

router.use("/v1/chat", chatRouter);

export default router;