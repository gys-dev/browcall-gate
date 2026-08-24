import { log, sleep } from '../../common/utils';
import { ContentAppAbstract } from '../content.abstract';
import { StartPayload } from '../../common/interface';
import { DecoderPlain } from '../../common/html-decoder/decoder-plain';
import { DecoderMarkdown } from '../../common/html-decoder/decoder-markdown';
import { DecoderJson } from '../../common/html-decoder/decoder-json';

export class ClaudeContentApp extends ContentAppAbstract {
    static SELECTORS = {
        input: [
            'div[role="textbox"][contenteditable="true"][data-testid="chat-input"]',
            'div[role="textbox"][contenteditable="true"][aria-label="Write your prompt to Claude"]',
            '[data-testid="chat-input"]',
            '.ProseMirror[contenteditable="true"]',
        ],
        submitButton: [
            'button[data-testid="chat-input-send"]',
            'button[aria-label="Send message"]',
            'button[data-testid="send-button"]',
        ],
        stopButton: [
            'button[aria-label*="Stop" i]',
            'button[data-testid="stop-button"]',
            'cds-btn-squish'
        ],
        responseArticle: '[data-perf-row="assistant"][data-last-message="true"]',
        response: '[data-perf-row="assistant"][data-last-message="true"] .standard-markdown',
        completionStatus: 'main [role="status"]',
        ignoreClasses: '.truncate.font-base [data-cds="Collapsible"]'
    } as const;

    getSelectors(): Record<string, string> {
        return {
            input: ClaudeContentApp.SELECTORS.input.join(', '),
            composingBtn: ClaudeContentApp.SELECTORS.submitButton.join(', '),
            composingState: ClaudeContentApp.SELECTORS.stopButton.join(', '),
            response: ClaudeContentApp.SELECTORS.response,
            turn: ClaudeContentApp.SELECTORS.responseArticle,
        };
    }

    removeIgnoredClasses(rootEl: Element): Element {
        const ignoreSelector = this.getSelectors().ignoreClasses;
        const toRemoves = rootEl.querySelectorAll(ignoreSelector);
        toRemoves.forEach(el => el.remove());
        return rootEl;
    }

    private queryFirst(selectors: readonly string[]): Element | null {
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    }

    private getInput(): HTMLElement | null {
        return this.queryFirst(ClaudeContentApp.SELECTORS.input) as HTMLElement | null;
    }

    private getLastResponse(): Element | null {
        const responses = Array.from(
            document.querySelectorAll(ClaudeContentApp.SELECTORS.responseArticle)
        );

        return responses[responses.length - 1] || null;
    }

    private getCompletionStatus(): string {
        return Array.from(document.querySelectorAll(ClaudeContentApp.SELECTORS.completionStatus))
            .map((el) => el.textContent?.trim() || '')
            .filter(Boolean)
            .join(' ');
    }

    async extractResponseText(): Promise<{ text: string; citations: any[] }> {
        const responseEl = this.getLastResponse();
        if (!responseEl) return { text: '', citations: [] };

        const filteredEl = this.removeIgnoredClasses(responseEl?.cloneNode(true) as Element);
        log("live view: ", filteredEl)
        switch (this.outputFormat) {
            case 'markdown':
                return {
                    text: await new DecoderMarkdown().decode(filteredEl),
                    citations: [],
                };
            case 'json':
                return {
                    text: await new DecoderJson().decode(filteredEl),
                    citations: [],
                };
            case 'plain':
            default:
                return {
                    text: await new DecoderPlain().decode(filteredEl),
                    citations: [],
                };
        }
    }

    isResponseComplete(): boolean {
        const stopButton = this.queryFirst(ClaudeContentApp.SELECTORS.stopButton);
        if (stopButton && !(stopButton as HTMLButtonElement).disabled) {
            return false;
        }

        const status = this.getCompletionStatus().toLowerCase();
        return status.includes('finished the response');
    }

    async setMode(_mode: any): Promise<void> {
        // Claude chat mode is intentionally left unchanged for the first integration.
    }

    private setInputValue(input: HTMLElement, text: string) {
        input.focus();

        document.execCommand('selectAll');
        document.execCommand('delete');
        document.execCommand('insertText', false, text);

        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: text,
        }));
    }

    private clickSubmit(): boolean {
        const button = this.queryFirst(ClaudeContentApp.SELECTORS.submitButton) as HTMLButtonElement | null;
        if (!button || button.disabled) return false;
        button.click();
        return true;
    }



    async start(payload: StartPayload): Promise<void> {
        this.stopped = false;
        this.outputFormat = payload.outputFormat || 'plain';

        const input = this.getInput();
        if (!input) {
            log('Claude input not found');
            this.finishTask();
            return;
        }

        this.setInputValue(input, payload.text);
        await sleep(250);

        if (!this.clickSubmit()) {
            input.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true,
            }));
        }

        await sleep(250);
        this.observeClaudeResponse();
    }

    private observeClaudeResponse() {
        let lastLen = 0;
        let stableChecks = 0;

        this.observer?.disconnect();
        super.observe(async () => {
            // Claude may expose an assistant response while it is still executing
            // tools. Ignore that intermediate content and wait for completion.
            if (!this.isResponseComplete()) {
                lastLen = 0;
                stableChecks = 0;
                return;
            }

            const data = await this.extractResponseText();
            if (!data.text) return;

            if (data.text.length > lastLen) {
                lastLen = data.text.length;
                stableChecks = 0;
                this.send({
                    type: 'answer',
                    data: {
                        text: data.text,
                        citations: data.citations,
                        complete: false,
                    },
                });
            } else {
                stableChecks += 1;
            }

            if (this.isResponseComplete() && stableChecks >= 4) {
                await sleep(600);
                const finalData = await this.extractResponseText();
                if (!finalData.text) return;
                log("finalText: ", finalData.text);
                this.lastText = finalData.text;
                this.observer?.disconnect();

                this.send({
                    type: 'answer',
                    data: {
                        text: finalData.text,
                        citations: finalData.citations,
                        complete: true,
                    },
                });

                if (!this.stopped) {
                    this.stopped = true;
                    this.send({ type: 'stop' });
                }

                this.finishTask();
            }
        });
    }
}
