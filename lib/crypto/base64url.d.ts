/** Encode bytes without padding using the URL-safe Base64 alphabet. */
export declare function encodeBase64Url(bytes: Uint8Array): string;
/** Decode canonical unpadded URL-safe Base64. */
export declare function decodeBase64Url(value: string, expectedBytes?: number): Uint8Array<ArrayBuffer>;
/** UTF-8 encode text. */
export declare function encodeUtf8(value: string): Uint8Array<ArrayBuffer>;
/** UTF-8 decode text, rejecting malformed input. */
export declare function decodeUtf8(value: ArrayBuffer): string;
//# sourceMappingURL=base64url.d.ts.map