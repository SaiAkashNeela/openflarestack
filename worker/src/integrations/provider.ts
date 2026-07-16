export type OpenAICompatibleIntegrationConfig = {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export type CloudflareAIGatewayConfig = {
  endpoint?: string
  authToken?: string
  model?: string
  provider?: string
}

export function readOpenAICompatibleIntegrationConfig(config: string): OpenAICompatibleIntegrationConfig {
  if (!config) return {}
  try {
    const parsed = JSON.parse(config) as Record<string, unknown>
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined,
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
    }
  } catch {
    return {}
  }
}

export function readCloudflareAIGatewayConfig(config: string): CloudflareAIGatewayConfig {
  if (!config) return {}
  try {
    const parsed = JSON.parse(config) as Record<string, unknown>
    return {
      endpoint: typeof parsed.endpoint === 'string' ? parsed.endpoint : undefined,
      authToken: typeof parsed.authToken === 'string' ? parsed.authToken : undefined,
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
      provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
    }
  } catch {
    return {}
  }
}
