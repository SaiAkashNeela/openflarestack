import { decodeUtf8, encodeUtf8, signHmacSha256, verifyHmacSha256 } from '../lib/crypto'
import type { Env } from '../index'

export type ConnectState = {
  orgId: string
  integrationId: string
  type: string
  nonce: string
}

export function connectSecret(env: Env) {
  return env.WEBCHAT_SECRET ?? env.BETTER_AUTH_SECRET
}

function base64UrlEncode(value: string) {
  let binary = ''
  for (const byte of encodeUtf8(value)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return decodeUtf8(bytes)
}

export async function createConnectState(env: Env, state: ConnectState) {
  const payload = base64UrlEncode(JSON.stringify(state))
  const signature = await signHmacSha256(connectSecret(env), payload)
  return `${payload}.${signature}`
}

export async function verifyConnectState(env: Env, token: string) {
  const lastDot = token.lastIndexOf('.')
  if (lastDot < 1) return null
  const payload = token.slice(0, lastDot)
  const signature = token.slice(lastDot + 1)
  if (!signature) return null
  const ok = await verifyHmacSha256(connectSecret(env), payload, signature)
  if (!ok) return null
  try {
    return JSON.parse(base64UrlDecode(payload)) as ConnectState
  } catch {
    return null
  }
}

