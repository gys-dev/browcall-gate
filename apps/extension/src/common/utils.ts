import { Host } from './interface';
/**
 * Given a URL or hostname, returns the matching Host enum value based on prefix match.
 * @param urlOrHost string (full URL or hostname)
 * @returns Host enum value or undefined if no match
 */
export function getApp(urlOrHost: string): Host | undefined {
    let hostname = urlOrHost;
    try {
        // If input is a full URL, extract hostname
        if (/^https?:\/\//.test(urlOrHost)) {
            hostname = new URL(urlOrHost).hostname;
        }
    } catch {
        // fallback: use as is
    }
    // Check if hostname starts with any Host enum value
    for (const value of Object.values(Host)) {
        if (hostname === value || hostname.endsWith('.' + value) || hostname.startsWith(value)) {
            return value as Host;
        }
    }
    return undefined;
}

export const log = (...args: unknown[]) => {
    console.log('[perplexity-api-content]', ...args);
};


export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function cleanText(text: string): string {
    return text.replace(
        // eslint-disable-next-line no-control-regex, no-misleading-character-class
        /[\u200B\u200C\u200D\uFEFF]|[\u0000-\u001F\u007F-\u009F]/g,
        ''
    );
}