import type { Env } from '../index'
export const queueConsumer: ExportedHandlerQueueHandler<Env> = async (batch) => {
  for (const msg of batch.messages) {
    msg.ack()
  }
}
