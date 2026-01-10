import { Decoder } from "./base";

export class DecoderJson implements Decoder {
    async decode(input: Element): Promise<string> {
        try {
            if (!input) {
                return '';
            }
            // Get raw text
            let jsonText = input.textContent || '';
            console.log("Raw JSON text:", jsonText);
            // Standardize: remove excessive whitespace, normalize newlines, trim
            jsonText = jsonText.replace(/\r\n|\r/g, '\n');
            jsonText = jsonText.replace(/\n{2,}/g, '\n'); // collapse multiple newlines
            jsonText = jsonText.replace(/\s{2,}/g, ' '); // collapse multiple spaces
            jsonText = jsonText.trim();

            // Try to parse JSON
            let jsonObject: unknown;
            try {
                jsonObject = JSON.parse(jsonText);
            } catch (err) {
                // If parsing fails, try to fix common issues (e.g. single quotes, trailing commas)
                let fixedText = jsonText.replace(/'/g, '"');
                fixedText = fixedText.replace(/,\s*([}\]])/g, '$1'); // remove trailing commas
                try {
                    jsonObject = JSON.parse(fixedText);
                } catch (err2) {
                    return jsonText; // fallback: return cleaned text
                }
            }
            console.log("Decoded JSON object:", jsonObject);
            return JSON.stringify(jsonObject, null, 2);
        } catch (error) {
            console.error("Error decoding JSON:", error);
            return input.textContent || '';
        }
    }
}
