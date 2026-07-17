export type OpenAICompatibleIntegrationConfig = {
  baseUrl?: string
  apiKey?: string
  model?: string
  autoReplyEnabled?: boolean
}

export type ProviderIntegration = {
  id: string
  type: 'openai_compatible'
  config: string
}

export function readOpenAICompatibleIntegrationConfig(config: string): OpenAICompatibleIntegrationConfig {
  if (!config) return {}
  try {
    const parsed = JSON.parse(config) as Record<string, unknown>
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined,
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
      autoReplyEnabled: readBoolean(parsed.autoReplyEnabled ?? parsed.auto_reply_enabled),
    }
  } catch {
    return {}
  }
}

export async function requestProviderChatCompletion(
  integration: ProviderIntegration,
  body: Record<string, unknown>,
  options?: { timeoutMs?: number; retries?: number },
) {
  const attempts = Math.max(1, (options?.retries ?? 0) + 1)
  const timeoutMs = Math.max(1000, options?.timeoutMs ?? 20_000)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('Provider request timed out')), timeoutMs)

    try {
      const res = await fetchProviderChatCompletion(integration, body, controller.signal)
      clearTimeout(timeout)
      return res
    } catch (error) {
      clearTimeout(timeout)
      lastError = error
      console.warn('Provider request failed', {
        integrationId: integration.id,
        integrationType: integration.type,
        attempt,
        attempts,
        error: error instanceof Error ? error.message : String(error),
      })
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
        continue
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Provider request failed')
}

async function fetchProviderChatCompletion(
  integration: ProviderIntegration,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  if (integration.type === 'openai_compatible') {
    const config = readOpenAICompatibleIntegrationConfig(integration.config)
    if (!config.baseUrl || !config.apiKey) throw new Error('Provider is not configured')
    const model = (typeof body.model === 'string' && body.model) || config.model
    if (!model) throw new Error('Model required')
    return fetch(`${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ ...body, model }),
    })
  }

  throw new Error('Unsupported provider integration')
}

function readBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  }
  return false
}
