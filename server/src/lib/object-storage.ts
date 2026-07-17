import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export type ObjectBody = ArrayBuffer | ArrayBufferView | Blob | string | ReadableStream

export type ObjectMetadata = {
  contentType?: string
}

export type StoredObject = {
  body: Buffer
  httpMetadata?: ObjectMetadata
  customMetadata?: Record<string, string>
}

export type ObjectStorage = {
  get(key: string): Promise<StoredObject | null>
  put(key: string, value: ObjectBody, options?: { httpMetadata?: ObjectMetadata; customMetadata?: Record<string, string> }): Promise<{ key: string }>
  delete(key: string): Promise<void>
  presignGetUrl?(key: string, expiresInSeconds?: number): Promise<string>
  presignPutUrl?(
    key: string,
    options?: { httpMetadata?: ObjectMetadata; customMetadata?: Record<string, string> },
    expiresInSeconds?: number,
  ): Promise<string>
}

export type ObjectStorageConfig =
  | {
      provider?: 'local'
      rootDir: string
    }
  | {
      provider: 's3'
      bucket: string
      region: string
      endpoint?: string
      accessKeyId?: string
      secretAccessKey?: string
      forcePathStyle?: boolean
    }

export function createObjectStorage(config: ObjectStorageConfig): ObjectStorage {
  if (config.provider === 's3') {
    return new S3ObjectStorage(config)
  }
  return new LocalObjectStorage(config.rootDir)
}

class LocalObjectStorage implements ObjectStorage {
  private readonly rootDir: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
  }

  async get(key: string) {
    const filePath = objectPath(this.rootDir, key)
    const metaPath = `${filePath}.meta.json`

    try {
      const [body, metaText] = await Promise.all([
        readFile(filePath),
        readFile(metaPath, 'utf8').catch(() => ''),
      ])
      const metadata = metaText ? (JSON.parse(metaText) as { httpMetadata?: ObjectMetadata; customMetadata?: Record<string, string> }) : {}
      return {
        body,
        httpMetadata: metadata.httpMetadata,
        customMetadata: metadata.customMetadata,
      }
    } catch {
      return null
    }
  }

  async put(key: string, value: ObjectBody, options?: { httpMetadata?: ObjectMetadata; customMetadata?: Record<string, string> }) {
    const filePath = objectPath(this.rootDir, key)
    await mkdir(dirname(filePath), { recursive: true })
    const body = await toBuffer(value)
    await writeFile(filePath, body)
    await writeFile(
      `${filePath}.meta.json`,
      JSON.stringify(
        {
          httpMetadata: options?.httpMetadata ?? {},
          customMetadata: options?.customMetadata ?? {},
        },
        null,
        2,
      ),
    )
    return { key }
  }

  async delete(key: string) {
    const filePath = objectPath(this.rootDir, key)
    await rm(filePath, { force: true })
    await rm(`${filePath}.meta.json`, { force: true })
  }
}

class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(config: Extract<ObjectStorageConfig, { provider: 's3' }>) {
    this.bucket = config.bucket.trim()
    if (!this.bucket) {
      throw new Error('OBJECT_STORAGE_BUCKET is required when OBJECT_STORAGE_PROVIDER=s3')
    }
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    })
  }

  async get(key: string) {
    try {
      const output = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      )
      return {
        body: await bodyToBuffer(output.Body),
        httpMetadata: output.ContentType ? { contentType: output.ContentType } : undefined,
        customMetadata: output.Metadata,
      }
    } catch (error) {
      if (isMissingObjectError(error)) return null
      throw error
    }
  }

  async put(
    key: string,
    value: ObjectBody,
    options?: { httpMetadata?: ObjectMetadata; customMetadata?: Record<string, string> },
  ) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: await toBuffer(value),
        ContentType: options?.httpMetadata?.contentType,
        Metadata: options?.customMetadata,
      }),
    )
    return { key }
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    )
  }

  async presignGetUrl(key: string, expiresInSeconds = 900) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    )
  }

  async presignPutUrl(
    key: string,
    options?: { httpMetadata?: ObjectMetadata; customMetadata?: Record<string, string> },
    expiresInSeconds = 900,
  ) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options?.httpMetadata?.contentType,
        Metadata: options?.customMetadata,
      }),
      { expiresIn: expiresInSeconds },
    )
  }
}

function objectPath(rootDir: string, key: string) {
  return join(rootDir, key)
}

async function toBuffer(value: ObjectBody) {
  if (typeof value === 'string') return Buffer.from(value)
  if (value instanceof Blob) return Buffer.from(await value.arrayBuffer())
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }
  if (value instanceof Readable) {
    const chunks: Buffer[] = []
    for await (const chunk of value) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
  return Buffer.from(await new Response(value).arrayBuffer())
}

async function bodyToBuffer(body: GetObjectCommandOutput['Body']) {
  if (!body) return Buffer.alloc(0)
  if (body instanceof Readable) {
    const chunks: Buffer[] = []
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer())
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
  }
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === 'function') {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray()
    return Buffer.from(bytes)
  }
  return Buffer.from(await new Response(body as ReadableStream).arrayBuffer())
}

function isMissingObjectError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  return name === 'NoSuchKey' || name === 'NotFound' || name === 'NotFoundException' || name === 'NoSuchBucket'
}
