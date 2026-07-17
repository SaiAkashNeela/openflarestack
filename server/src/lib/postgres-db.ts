import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Pool, type PoolClient, types } from 'pg'
import { execSync } from 'node:child_process'

types.setTypeParser(20, (value) => Number.parseInt(value, 10))

const CAMEL_CASE_IDENTIFIERS = [
  'activeOrganizationId',
  'accountId',
  'accessToken',
  'accessTokenExpiresAt',
  'actorUserId',
  'createdAt',
  'emailVerified',
  'entityId',
  'entityType',
  'expiresAt',
  'idToken',
  'ipAddress',
  'inviterId',
  'lastReadAt',
  'lastMessageAt',
  'organizationId',
  'providerId',
  'refreshToken',
  'refreshTokenExpiresAt',
  'senderId',
  'senderType',
  'teamId',
  'activeTeamId',
  'updatedAt',
  'userAgent',
  'userId',
  'emailNotifications',
  'mentionNotifications',
  'digestNotifications',
] as const

const RESERVED_IDENTIFIERS = ['user'] as const
const UNIX_EPOCH_REPLACEMENT = 'extract(epoch from now())::int'

export type SqlStatementResult = {
  success: true
  meta: {
    changes: number
    last_row_id: number | null
  }
}

export interface SqlDatabase {
  pool: Pool
  prepare(sql: string): SqlPreparedStatement<unknown>
  batch(statements: Array<SqlPreparedStatement<unknown>>): Promise<SqlStatementResult[]>
  exec(sql: string): Promise<void>
  close(): Promise<void>
}

export class PostgresDatabase implements SqlDatabase {
  readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  prepare(sql: string) {
    return new SqlPreparedStatement(this.pool, sql)
  }

  async batch(statements: Array<SqlPreparedStatement<unknown>>) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const results: SqlStatementResult[] = []
      for (const statement of statements) {
        results.push(await statement.runOn(client))
      }
      await client.query('COMMIT')
      return results
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async exec(sql: string) {
    for (const statement of splitSqlStatements(sql)) {
      await this.pool.query(rewriteSql(statement))
    }
  }

  async close() {
    await this.pool.end()
  }
}

export class SqlPreparedStatement<T> {
  private bindings: unknown[] = []
  private readonly sql: string
  private readonly pool: Pool

  constructor(pool: Pool, sql: string) {
    this.pool = pool
    this.sql = rewriteSql(sql)
  }

  bind(...values: unknown[]) {
    this.bindings = values.map((value) => (value === undefined ? null : value))
    return this
  }

  async first<U = T>(): Promise<U | null> {
    const result = await this.pool.query(this.sql, this.bindings as never[])
    return (result.rows[0] as U | undefined) ?? null
  }

  async all<U = T>(): Promise<{ results: U[] }> {
    const result = await this.pool.query(this.sql, this.bindings as never[])
    return { results: result.rows as U[] }
  }

  async run(): Promise<SqlStatementResult> {
    return this.runOn(this.pool)
  }

  async runOn(client: PoolClient | Pool) {
    const result = await client.query(this.sql, this.bindings as never[])
    return {
      success: true as const,
      meta: {
        changes: result.rowCount ?? 0,
        last_row_id: null,
      },
    }
  }
}

export async function createPostgresDatabase(options: {
  connectionString: string
  migrationsDir: string
}) {
  const pool = new Pool({ connectionString: options.connectionString })
  await applyMigrations(pool, options.migrationsDir)
  return new PostgresDatabase(pool)
}

async function applyMigrations(pool: Pool, migrationsDir: string) {
  try {
    console.log("Checking database schema sync via Prisma...")
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' })
  } catch (error) {
    console.error("Prisma db push failed, regenerating and pushing...", error)
    execSync('npx prisma generate', { stdio: 'inherit' })
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' })
  }
}

function rewriteSql(sql: string) {
  let next = sql.replace(/\bunixepoch\(\)/gi, UNIX_EPOCH_REPLACEMENT)

  for (const identifier of RESERVED_IDENTIFIERS) {
    const pattern = new RegExp(`(?<!")\\b${identifier}\\b(?!")`, 'g')
    next = next.replace(pattern, `"${identifier}"`)
  }

  for (const identifier of [...CAMEL_CASE_IDENTIFIERS].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(?<!")\\b${identifier}\\b(?!")`, 'g')
    next = next.replace(pattern, `"${identifier}"`)
  }

  let placeholderCounter = 0
  next = next.replace(/\?/g, () => `$${++placeholderCounter}`)
  return next
}

function splitSqlStatements(sql: string) {
  const statements: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let inLineComment = false

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (inLineComment) {
      current += char
      if (char === '\n') inLineComment = false
      continue
    }

    if (!inSingle && !inDouble && char === '-' && next === '-') {
      inLineComment = true
      current += char + next
      index += 1
      continue
    }

    if (!inDouble && char === "'") {
      inSingle = !inSingle
      current += char
      continue
    }

    if (!inSingle && char === '"') {
      inDouble = !inDouble
      current += char
      continue
    }

    if (!inSingle && !inDouble && char === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      continue
    }

    current += char
  }

  const trimmed = current.trim()
  if (trimmed) statements.push(trimmed)
  return statements
}
