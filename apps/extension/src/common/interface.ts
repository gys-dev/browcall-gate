export enum Host {
    PerplexityAI = 'perplexity.ai',
    ChatGPT = 'chatgpt.com',
}

export type StartPayload = {
    text: string;
    mode?: 'Search' | 'Research' | 'Labs';
    outputFormat?: 'plain' | 'json' | 'markdown' | 'image';
};

export type ConnectState = 'connected' | 'connecting' | 'error' | 'disconnected'

export interface SessionPayload  {
    apiPort: number
    socketPort: number
    tabId: number
}