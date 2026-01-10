export interface Decoder {
    /**
     * Decode the given input string (e.g. unescape HTML entities or numeric character references)
     * into a plain-text representation.
     *
     * Implementations should be pure (not mutate input) and return the decoded string.
     *
     * @param input - the string to decode
     * @returns decoded string
     */
    decode(input: Element): Promise<string>;
}