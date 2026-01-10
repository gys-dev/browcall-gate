import TurnDown from "turndown";
import { Decoder } from "./base";
import {gfm, tables, taskListItems, highlightedCodeBlock, strikethrough} from 'turndown-plugin-gfm';


const turndownService = new TurnDown();
turndownService.use([gfm, tables, strikethrough, taskListItems, highlightedCodeBlock]);


export class DecoderMarkdown implements Decoder {
    async decode(input: Element): Promise<string> {
        try {
            if (!input) {
                return '';
            }

            const parseMarkdown = turndownService.turndown(input as HTMLElement);

            return parseMarkdown;
        } catch (error) {
            console.error("Error decoding markdown:", error);
            return input.textContent || '';
        }

    }


}