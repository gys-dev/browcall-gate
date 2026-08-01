export enum Host {
    PerplexityAI = 'perplexity.ai',
    ChatGPT = 'chatgpt.com',
    Gemini = 'gemini.google.com'
}

export type StartPayload = {
    uuid: string
    text: string;
    mode?: 'Search' | 'Research' | 'Labs';
    outputFormat?: 'plain' | 'json' | 'markdown' | 'image';
};

export type ConnectState = 'connected' | 'connecting' | 'error' | 'disconnected'

export interface SessionPayload {
    apiPort: number
    socketPort: number
    tabId: number
}