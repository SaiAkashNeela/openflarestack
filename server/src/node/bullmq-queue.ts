import { Queue, QueueEvents, Worker } from 'bullmq'
import type { Env } from '../index'
import { processJob } from '../queues/consumer'
import { queueJobName, queueJobOptions, type QueueJob } from '../queues/types'

type RedisConnectionOptions = {
  host: string
  port: number
  username?: string
  password?: string
  db?: number
  tls?: Record<string, never>
}

export function createBullMqQueue(options: {
  redisUrl: string
  getEnv: () => Env
  concurrency: number
}) {
  const connection = parseRedisUrl(options.redisUrl)
  const queueName = 'flaredesk-jobs'
  const deadLetterQueueName = `${queueName}-dead-letter`

  const queue = new Queue<QueueJob>(queueName, { connection })
  const deadLetterQueue = new Queue<Record<string, unknown>>(deadLetterQueueName, { connection })
  const events = new QueueEvents(queueName, { connection })
  const worker = new Worker(
    queueName,
    async (job) => {
      await processJob(job.data, options.getEnv())
    },
    {
      connection,
      concurrency: Math.max(1, options.concurrency),
    },
  )

  worker.on('completed', (job) => {
    console.info('Queue job completed', {
      jobId: job.id,
      name: job.name,
    })
  })

  worker.on('failed', async (job, error) => {
    if (!job) return
    console.warn('Queue job failed', {
      jobId: job.id,
      name: job.name,
      attemptsMade: job.attemptsMade,
      attempts: job.opts.attempts ?? 1,
      error: error instanceof Error ? error.message : String(error),
    })

    if (job.attemptsMade < (job.opts.attempts ?? 1)) {
      return
    }

    await deadLetterQueue.add(
      'dead-letter',
      {
        queue: queueName,
        jobId: job.id,
        name: job.name,
        data: job.data,
        failedReason: error instanceof Error ? error.message : String(error),
        attemptsMade: job.attemptsMade,
        stacktrace: job.stacktrace ?? [],
        failedAt: new Date().toISOString(),
      },
      {
        jobId: `dead-letter|${job.id ?? queueJobName(job.data)}`,
        removeOnComplete: false,
        removeOnFail: false,
      },
    )
  })

  worker.on('error', (error) => {
    console.error('Queue worker error', error)
  })

  events.on('completed', ({ jobId }) => {
    console.info('Queue event completed', { jobId })
  })

  events.on('failed', ({ jobId, failedReason }) => {
    console.warn('Queue event failed', { jobId, failedReason })
  })

  return {
    async send(job: QueueJob) {
      await queue.add(queueJobName(job), job, queueJobOptions(job))
      return { ok: true as const }
    },
    async close() {
      await Promise.allSettled([worker.close(), events.close(), deadLetterQueue.close(), queue.close()])
    },
  }
}

function parseRedisUrl(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl)
  const db = url.pathname && url.pathname !== '/' ? Number.parseInt(url.pathname.slice(1), 10) : undefined
  return {
    host: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isFinite(db) ? db : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  }
}
