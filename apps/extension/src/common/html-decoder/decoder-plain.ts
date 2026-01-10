import { Decoder } from "./base";

export class DecoderPlain  implements Decoder {
    /**
     * Decode the given input string (e.g. unescape HTML entities or numeric character references)
     * into a plain-text representation.
     *
     * This implementation is a no-op and returns the input as-is.
     *
     * @param input - the string to decode
     * @returns decoded string
     */
    decode(input: Element): Promise<string> {
        if (!input) return Promise.resolve('');
        const text = input.textContent;
        return Promise.resolve(text);
    }
}