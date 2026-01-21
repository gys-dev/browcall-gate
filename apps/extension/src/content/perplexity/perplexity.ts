
import { log, sleep, cleanText } from "../../common/utils";
import { WSSingleton } from "../../common/ws-singleton";
import { Citation } from "../perplexity/interface";
import { ContentAppAbstract } from "../content.abstract";
import { StartPayload } from '../../common/interface';
import { WSPayload } from "@interfaces";

export class PerplexityContentApp extends ContentAppAbstract {
    static SELECTORS = {
        input: '#ask-input',
        followUpInput: 'textarea[placeholder*="follow"]',
        submitButton: 'button[aria-label="Submit"]',
        stopButton: 'button[aria-label*="Stop"]',
        responseContainer: '.prose',
        newThreadButton: 'button[data-testid="sidebar-new-thread"]',
        searchMode: 'radio[aria-label="Search"]',
        researchMode: 'radio[aria-label="Research"]',
        labsMode: 'radio[aria-label="Labs"]',
    } as const;



    getSelectors() {
        return PerplexityContentApp.SELECTORS;
    }


    async extractResponseText(): Promise<{ text: string; citations: Citation[] }> {
        const prose = document.querySelector(PerplexityContentApp.SELECTORS.responseContainer);
        if (!prose) return { text: '', citations: [] };

        let fullText = '';
        const citations: Citation[] = [];

        prose.querySelectorAll('h2, p, ul, li').forEach(el => {
            const clone = el.cloneNode(true) as HTMLElement;

            clone.querySelectorAll<HTMLAnchorElement>('a.citation').forEach(a => {
                const href = a.getAttribute('href');
                const label = a.getAttribute('aria-label') || undefined;

                if (href && !citations.some(c => c.url === href)) {
                    citations.push({ url: href, label });
                }

                a.replaceWith(` [${citations.length}]`);
            });

            const t = clone.textContent?.trim();
            if (!t) return;

            if (el.tagName === 'H2') fullText += `\n## ${t}\n`;
            else if (el.tagName === 'LI') fullText += `• ${t}\n`;
            else fullText += `${t}\n`;
        });

        if (citations.length) {
            fullText += '\n\n--- References ---\n';
            citations.forEach((c, i) => {
                fullText += `[${i + 1}] ${c.label || c.url}\n    ${c.url}\n`;
            });
        }

        return { text: cleanText(fullText.trim()), citations };
    }


    isResponseComplete(): boolean {
        const stop =
            document.querySelector<HTMLButtonElement>(PerplexityContentApp.SELECTORS.stopButton) ||
            document.querySelector<HTMLButtonElement>('button[aria-label*="Stop generating"]');

        if (stop && !stop.disabled) return false;

        return Boolean(
            document.querySelector('button[aria-label="Copy"]') ||
            document.querySelector('button[data-testid="share-button"]') ||
            document.querySelector('button[aria-label="Rewrite"]') ||
            document.querySelector('button[aria-label="Helpful"]')
        );
    }

    init() {
        // Wait for page to load
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.setupUI());
        } else {
            this.setupUI();
        }
    }


    connect() {
        this.socket = WSSingleton.getSocket();

        WSSingleton.onOpen(() => log('WS connected'));
        WSSingleton.onError((err) => log('WS error', err));
        WSSingleton.onClose(() => {
            log('WS closed – reconnecting');
        });
        WSSingleton.onMessage(e => {
            if (typeof e.data !== 'string') return;
            try {
                const wsPayload = JSON.parse(e.data) as WSPayload<StartPayload>;
                this.start(wsPayload.data!);
            } catch (err) {
                log('Invalid WS message', err);
            }
        });
    }


    async start({ text, mode }: StartPayload) {
        this.stopped = false;

        if (mode) await this.setMode(mode);

        const newThread =
            document.querySelector<HTMLButtonElement>(PerplexityContentApp.SELECTORS.newThreadButton);

        newThread?.click();
        await sleep(1200);

        const input =
            document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
                PerplexityContentApp.SELECTORS.followUpInput
            ) ||
            document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
                PerplexityContentApp.SELECTORS.input
            );

        if (!input) {
            log('Input not found');
            return;
        }

        input.focus();
        document.execCommand('selectAll');
        document.execCommand('delete');
        document.execCommand('insertText', false, text);

        input.dispatchEvent(new InputEvent('input', { bubbles: true }));

        await sleep(300);
        input.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
            })
        );

        this.observe();
    }


    async setMode(mode: StartPayload['mode']) {
        if (!mode) return;

        const map = {
            Search: PerplexityContentApp.SELECTORS.searchMode,
            Research: PerplexityContentApp.SELECTORS.researchMode,
            Labs: PerplexityContentApp.SELECTORS.labsMode,
        } as const;

        const el =
            document.querySelector<HTMLInputElement>(map[mode]);

        if (el && !el.checked) {
            el.click();
            await sleep(400);
        }
    }


    observe() {
        let lastLen = 0;
        this.observer?.disconnect();
        super.observe(async () => {
            const data = await this.extractResponseText();
            if (!data.text) return;

            if (data.text.length > lastLen) {
                lastLen = data.text.length;
                this.send({
                    type: 'answer',
                    data: {
                        text: data.text,
                        citations: data.citations,
                        complete: false,
                    }
                });
            }

            if (this.isResponseComplete() && data.text !== this.lastText) {
                this.lastText = data.text;
                this.observer?.disconnect();

                this.send({
                    type: 'answer',
                    data: {
                        text: data.text,
                        citations: data.citations,
                        complete: true,
                    }
                });

                if (!this.stopped) {
                    this.stopped = true;
                    this.send({ type: 'stop' });
                }
            }
        });
    }
}
