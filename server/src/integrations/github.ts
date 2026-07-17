import type { Env } from '../index'
import { encodeUtf8, signHmacSha256, signJwtRs256, verifyHmacSha256 } from '../lib/crypto'
import type { IncomingMessage } from './types'

export type GitHubIntegrationConfig = {
  appId?: string
  appSlug?: string
  privateKey?: string
  clientId?: string
  clientSecret?: string
  installationId?: number
  owner?: string
  repository?: string
  selectedRepositories?: Array<{ id: number; name: string; full_name: string }>
  webhookSecret?: string
}

export function readGitHubIntegrationConfig(config: string): GitHubIntegrationConfig {
  if (!config) return {}
  try {
    const parsed = JSON.parse(config) as Record<string, unknown>
    return {
      appId: typeof parsed.appId === 'string' ? parsed.appId : undefined,
      appSlug: typeof parsed.appSlug === 'string' ? parsed.appSlug : undefined,
      privateKey: typeof parsed.privateKey === 'string' ? parsed.privateKey : undefined,
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined,
      clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : undefined,
      installationId:
        typeof parsed.installationId === 'number'
          ? parsed.installationId
          : typeof parsed.installationId === 'string'
            ? Number(parsed.installationId)
            : undefined,
      owner: typeof parsed.owner === 'string' ? parsed.owner : undefined,
      repository: typeof parsed.repository === 'string' ? parsed.repository : undefined,
      selectedRepositories: Array.isArray(parsed.selectedRepositories)
        ? parsed.selectedRepositories.filter(
            (repo): repo is { id: number; name: string; full_name: string } =>
              Boolean(
                repo &&
                  typeof repo === 'object' &&
                  typeof (repo as { id?: unknown }).id === 'number' &&
                  typeof (repo as { name?: unknown }).name === 'string' &&
                  typeof (repo as { full_name?: unknown }).full_name === 'string',
              ),
          )
        : undefined,
      webhookSecret: typeof parsed.webhookSecret === 'string' ? parsed.webhookSecret : undefined,
    }
  } catch {
    return {}
  }
}

function githubBaseUrl() {
  return 'https://api.github.com'
}

export async function createGitHubAppJwt(appId: string, privateKeyPem: string) {
  return signJwtRs256({}, { issuer: appId, privateKeyPem, expiresInSeconds: 600 })
}

export async function fetchGitHubInstallationToken(
  appId: string | undefined,
  privateKey: string | undefined,
  installationId: number,
) {
  if (!appId || !privateKey) throw new Error('GitHub app credentials are not configured')

  const jwt = await createGitHubAppJwt(appId, privateKey)
  const res = await fetch(`${githubBaseUrl()}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwt}`,
      'X-GitHub-Api-Version': '2026-03-10',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub installation token request failed: ${await res.text()}`)
  }
  return res.json() as Promise<{ token: string; expires_at: string; repositories?: Array<{ id: number; full_name: string }> }>
}

export async function fetchGitHubRepositoryComments(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const res = await fetch(`${githubBaseUrl()}/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2026-03-10',
    },
  })
  if (!res.ok) throw new Error(`GitHub comments fetch failed: ${await res.text()}`)
  return res.json() as Promise<Array<{ id: number; body: string; user: { login: string } }>>
}

export async function sendGitHubIssueComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
) {
  const res = await fetch(`${githubBaseUrl()}/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2026-03-10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(`GitHub comment create failed: ${await res.text()}`)
  return res.json() as Promise<{ id: number; body: string }>
}

export function parseGitHubIssueWebhook(payload: Record<string, unknown>): IncomingMessage | null {
  const action = typeof payload.action === 'string' ? payload.action : ''
  const issue = payload.issue && typeof payload.issue === 'object' ? (payload.issue as Record<string, unknown>) : null
  const comment = payload.comment && typeof payload.comment === 'object' ? (payload.comment as Record<string, unknown>) : null
  const repository = payload.repository && typeof payload.repository === 'object' ? (payload.repository as Record<string, unknown>) : null
  if (!repository) return null

  const owner = repository.owner && typeof repository.owner === 'object'
    ? (repository.owner as Record<string, unknown>)
    : null
  const ownerLogin = owner && typeof owner.login === 'string' ? owner.login : 'unknown'
  const repoName = typeof repository.name === 'string' ? repository.name : 'repository'

  if (issue && action === 'opened') {
    const issueNumber = typeof issue.number === 'number' ? issue.number : Number(issue.number ?? 0)
    return {
      externalId: `github-issue-${issueNumber}`,
      externalCustomerId: `github:${ownerLogin}/${repoName}`,
      customerName: `GitHub ${ownerLogin}/${repoName}`,
      text: typeof issue.title === 'string' ? issue.title : 'GitHub issue opened',
      subject: typeof issue.title === 'string' ? issue.title : undefined,
      channel: 'github',
      metadata: {
        event: 'issues.opened',
        action,
        repository: `${ownerLogin}/${repoName}`,
        issueNumber,
        issueUrl: typeof issue.html_url === 'string' ? issue.html_url : undefined,
      },
      conversationKey: `github:${ownerLogin}/${repoName}#${issueNumber}`,
    }
  }

  if (comment && issue && action === 'created') {
    const issueNumber = typeof issue.number === 'number' ? issue.number : Number(issue.number ?? 0)
    return {
      externalId: `github-comment-${issueNumber}-${typeof comment.id === 'number' ? comment.id : '0'}`,
      externalCustomerId: `github:${ownerLogin}/${repoName}`,
      customerName: `GitHub ${ownerLogin}/${repoName}`,
      text: typeof comment.body === 'string' ? comment.body : '',
      subject: typeof issue.title === 'string' ? issue.title : undefined,
      channel: 'github',
      metadata: {
        event: 'issue_comment.created',
        action,
        repository: `${ownerLogin}/${repoName}`,
        issueNumber,
        issueUrl: typeof issue.html_url === 'string' ? issue.html_url : undefined,
        commentUrl: typeof comment.html_url === 'string' ? comment.html_url : undefined,
      },
      conversationKey: `github:${ownerLogin}/${repoName}#${issueNumber}`,
    }
  }

  return null
}

export async function verifyGitHubWebhook(
  secret: string | undefined,
  rawBody: string,
  signature: string | null | undefined,
) {
  if (!secret || !signature) return false
  return verifyHmacSha256(secret, rawBody, signature.replace(/^sha256=/, ''))
}

export async function signGitHubWebhook(secret: string, rawBody: string) {
  return `sha256=${await signHmacSha256(secret, encodeUtf8(rawBody))}`
}
