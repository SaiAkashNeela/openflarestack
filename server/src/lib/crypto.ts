const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function encodeUtf8(value: string) {
  return textEncoder.encode(value)
}

export function decodeUtf8(value: ArrayBuffer | ArrayBufferView) {
  const view = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return textDecoder.decode(view)
}

export function toHex(bytes: ArrayBuffer | ArrayBufferView) {
  const array = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function hmacSha256(secret: string, payload: string | ArrayBuffer | ArrayBufferView) {
  const key = await crypto.subtle.importKey(
    'raw',
    encodeUtf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const data =
    typeof payload === 'string'
      ? encodeUtf8(payload)
      : payload instanceof ArrayBuffer
        ? new Uint8Array(payload)
        : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
  return crypto.subtle.sign('HMAC', key, data as any)
}

export async function signHmacSha256(secret: string, payload: string | ArrayBuffer | ArrayBufferView) {
  return toHex(await hmacSha256(secret, payload))
}

export async function verifyHmacSha256(
  secret: string,
  payload: string | ArrayBuffer | ArrayBufferView,
  expected: string,
) {
  const actual = await signHmacSha256(secret, payload)
  return timingSafeEqual(actual, expected)
}

function pemToDer(pem: string) {
  const stripped = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(stripped)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function base64UrlEncode(bytes: string | ArrayBuffer | ArrayBufferView) {
  const array =
    typeof bytes === 'string'
      ? encodeUtf8(bytes)
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let binary = ''
  for (const byte of array) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export async function signJwtRs256(
  payload: Record<string, unknown>,
  options: {
    issuer: string
    privateKeyPem: string
    expiresInSeconds?: number
    issuedAtSkewSeconds?: number
  },
) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iat: now - (options.issuedAtSkewSeconds ?? 60),
    exp: now + (options.expiresInSeconds ?? 600),
    iss: options.issuer,
    ...payload,
  }
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(options.privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encodeUtf8(signingInput))
  return `${signingInput}.${base64UrlEncode(signature)}`
}
