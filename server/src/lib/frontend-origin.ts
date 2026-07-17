export function getFrontendOrigin(frontendUrl: string) {
  return new URL(frontendUrl).origin
}

export function getTrustedFrontendOrigins(frontendUrl: string) {
  const origin = getFrontendOrigin(frontendUrl)
  const hostname = new URL(frontendUrl).hostname

  return [origin, `https://*.${hostname}`]
}

export function isTrustedFrontendOrigin(origin: string | null | undefined, frontendUrl: string) {
  if (!origin) return false

  const frontendOrigin = getFrontendOrigin(frontendUrl)
  if (origin === frontendOrigin) return true

  try {
    const parsed = new URL(origin)
    const frontendHostname = new URL(frontendUrl).hostname
    return parsed.protocol === 'https:' && parsed.hostname.endsWith(`.${frontendHostname}`)
  } catch {
    return false
  }
}
