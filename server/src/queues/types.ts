import type { JobsOptions } from 'bullmq'
import type { WebhookDeliveryJob } from '../integrations/events'
import type { InboundJob, OutboundJob } from '../integrations/types'

export type QueueJob = InboundJob | OutboundJob | WebhookDeliveryJob

export function queueJobName(job: QueueJob) {
  return job.type
}

export function queueJobOptions(job: QueueJob): JobsOptions {
  const base = {
    attempts: 10,
    backoff: {
      type: 'exponential' as const,
      delay: 500,
    },
    removeOnComplete: false,
    removeOnFail: false,
  }

  if (job.type === 'inbound') {
    return {
      ...base,
      jobId: `inbound|${job.organizationId}|${job.integrationId}|${job.incoming.externalId}`,
    }
  }

  if (job.type === 'outbound') {
    return {
      ...base,
      jobId: `outbound|${job.organizationId}|${job.messageId}`,
    }
  }

  return {
    ...base,
    jobId: `webhook-delivery|${job.organizationId}|${job.integrationId}|${job.deliveryId}`,
  }
}
