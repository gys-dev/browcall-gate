import { log, sleep } from '../../common/utils';
import { WSSingleton } from '../../common/ws-singleton';
import { ContentAppAbstract } from '../content.abstract';
import { StartPayload } from '../../common/interface';
import { Decoder } from '../../common/html-decoder/base';
import { DecoderPlain } from '../../common/html-decoder/decoder-plain';
import { DecoderMarkdown } from '../../common/html-decoder/decoder-markdown';
import { DecoderJson } from '../../common/html-decoder/decoder-json';
import { ConnectWindowEnum, WSPayload } from 'interfaces';

export class GeminiContentApp extends ContentAppAbstract {
    getSelectors(): Record<string, string> {
        return {
            response: 'message-content.ng-star-inserted:nth-last-child(1)',
            input: '.text-input-field_textarea',
            inputP: '.text-input-field_textarea p',
            composingBtn: 'button.submit',
            composingState: '.blue-circle.stop-icon',
            lastNode: '.avatar_spinner_animation',
            ignoreClasses: '.bg-token-sidebar-surface-primary > :first-child, .select-none.py-1, .code-block-decoration',
            agentBlockImage: '.agent-turn:nth-last-child(1) img'
            // Add more selectors as needed
        };
    }


    getLastResponse() {
        let selector = '';

        if (this.outputFormat === 'image') {
            selector = this.getSelectors().agentBlockImage;
        } else {
            selector = this.getSelectors().response;
        }

        const responseEls = document.querySelectorAll(selector);
        const latestElement = responseEls?.[responseEls.length - 1];
        return latestElement;
    }

    removeIgnoredClasses(rootEl: Element): Element {
        const ignoreSelector = this.getSelectors().ignoreClasses;
        const toRemoves = rootEl.querySelectorAll(ignoreSelector);
        toRemoves.forEach(el => el.remove());
        return rootEl;
    }

    async extractResponseText(): Promise<{ text: string; citations: any[] }> {
        const responseEl = this.getLastResponse();


        if (!responseEl) {
            return { text: '', citations: [] };
        }

        const filteredEl = this.removeIgnoredClasses(responseEl?.cloneNode(true) as Element);
        switch (this.outputFormat) {
            case 'markdown': {
                const markdownDecoder = new DecoderMarkdown();
                const text = await markdownDecoder.decode(filteredEl);
                return { text, citations: [] };
            }
            case 'plain': {
                const plainDecoder = new DecoderPlain();
                const text = await plainDecoder.decode(filteredEl);
                return { text, citations: [] };
            }
            case 'json': {
                const jsonDecoder = new DecoderJson();
                log("Extracting JSON response from element:", filteredEl);
                const text = await jsonDecoder.decode(filteredEl);
                return { text, citations: [] };
            }
            case 'image': {
                const imgEl = responseEl.querySelector('img') as HTMLImageElement;
                const text = imgEl?.src || '';
                return { text, citations: [] };
            }
            default: {
                log("Unknown output format, defaulting to plain text:", this.outputFormat);
                return { text: '', citations: [] };
            }
        }


    }

    isResponseComplete(): boolean {
        const composingState = document.querySelector(this.getSelectors().composingState);
        const latestElement = this.getLastResponse()?.parentElement?.parentElement;
        const closeStateEle = latestElement?.querySelector(this.getSelectors().lastNode);
        // const closeState = 1;
        console.log("Close state element:", closeStateEle);

        if (!composingState) {
            return true
        }
        return false;
    }

    async setMode(mode: any): Promise<void> {
        // TODO: Implement mode switching if OpenAI UI supports it
        // Otherwise, leave as a no-op
    }

    async start(payload: StartPayload): Promise<void> {
        const { text, outputFormat, uuid } = payload;
        this.outputFormat = outputFormat || 'plain';
        const inputEl = document.querySelector<HTMLInputElement>(this.getSelectors().inputP);

        if (inputEl) {
            inputEl.textContent = text;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(200); // slight delay to ensure input is registered

            const submitBtn = document.querySelector<HTMLButtonElement>(this.getSelectors().composingBtn);
            // Simulate pressing Enter or clicking send
            submitBtn?.click();
        }
        log("Started observing OpenAI response...");
        await sleep(200);
        this.observe();
    }

    observe() {
        let lastLen = 0;
        this.observer?.disconnect();
        super.observe(async (_, observerInstance) => {
            const data = await this.extractResponseText();

            if (data.text.length > lastLen) {
                lastLen = data.text.length;
                this.send({
                    type: 'answer',
                    data: {
                        text: data.text,
                        complete: false,
                    }
                });
            }

            if (this.isResponseComplete()) {
                await sleep(500); // ensure all data is captured
                const data = await this.extractResponseText();
                this.send({
                    type: 'answer',
                    data: {
                        text: data.text,
                        complete: true,
                    }
                });

                this.send({ type: 'stop' });
                this.lastText = data.text;
                observerInstance?.disconnect();
                this.finishTask();
            }
        });
    }

    protected connect() {
        super.connect();
    }
}
