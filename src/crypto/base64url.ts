/** Encode bytes without padding using the URL-safe Base64 alphabet. */
export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/** Decode canonical unpadded URL-safe Base64. */
export function decodeBase64Url(value: string, expectedBytes?: number): Uint8Array<ArrayBuffer> {
  if (value.length === 0 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error('invalid base64url')
  }
  const padding = '='.repeat((4 - value.length % 4) % 4)
  let binary: string
  try {
    binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding)
  } catch {
    throw new Error('invalid base64url')
  }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
    throw new Error(`expected ${String(expectedBytes)} bytes`)
  }
  if (encodeBase64Url(bytes) !== value) throw new Error('non-canonical base64url')
  return bytes
}

/** UTF-8 encode text. */
export function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value)
}

/** UTF-8 decode text, rejecting malformed input. */
export function decodeUtf8(value: ArrayBuffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(value)
}
