import { Request, Response, NextFunction } from 'express';

export const validateChatCompletions = (req: Request, res: Response, next: NextFunction) => {
    const { messages, outputFormat } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
            error: 'Invalid request: "messages" is required and must be an array.',
        });
    }

    if (messages.length === 0) {
        return res.status(400).json({
            error: 'Invalid request: "messages" array cannot be empty.',
        });
    }

    // Basic validation for message structure
    for (const msg of messages) {
        if (!msg.content) {
            return res.status(400).json({
                error: 'Invalid request: each message must have a "content" field.',
            });
        }
    }

    const validFormats = ['json', 'plain', 'markdown'];
    if (outputFormat && !validFormats.includes(outputFormat)) {
        return res.status(400).json({
            error: `Invalid request: "outputFormat" must be one of: ${validFormats.join(', ')}.`,
        });
    }

    next();
};
