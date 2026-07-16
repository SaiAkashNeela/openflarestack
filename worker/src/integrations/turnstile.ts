export async function verifyTurnstileToken(
  secretKey: string | undefined,
  token: string,
  remoteip?: string | null,
) {
  if (!secretKey) return true
  if (!token) return false

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  })

  if (remoteip) body.set('remoteip', remoteip)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!res.ok) return false

  const data = (await res.json().catch(() => null)) as { success?: boolean } | null
  return data?.success === true
}
