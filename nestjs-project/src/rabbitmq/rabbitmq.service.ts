import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { Channel, Connection, ConsumeMessage } from 'amqplib';
import queueConfig from '../config/queue.config';

export type QueueConsumerHandler = (
  message: ConsumeMessage,
  ack: () => void,
  nack: (requeue?: boolean) => void,
) => Promise<void> | void;

const RECONNECT_BACKOFF_MS = 5000;

@Injectable()
export class RabbitmqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private connecting: Promise<void> | null = null;

  constructor(
    @Inject(queueConfig.KEY)
    private readonly config: ConfigType<typeof queueConfig>,
  ) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // best-effort close on shutdown
    }
  }

  /** Lazily connects; resilient to the broker being down at startup. */
  async ensureConnected(): Promise<{
    connection: Connection;
    channel: Channel;
  }> {
    if (!this.connecting) {
      this.connecting = this.doConnect().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting.then(() => ({
      connection: this.connection!,
      channel: this.channel!,
    }));
  }

  private async doConnect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.config.rabbitmqUrl);
      this.channel = await this.connection.createChannel();

      // Configure the processing queue + its dead-letter queue.
      await this.channel.assertQueue(this.config.videoDeadLetterQueue, {
        durable: true,
      });
      await this.channel.assertQueue(this.config.videoProcessingQueue, {
        durable: true,
        deadLetterExchange: '',
        deadLetterRoutingKey: this.config.videoDeadLetterQueue,
      });
      await this.channel.prefetch(this.config.prefetch);
      this.logger.log('RabbitMQ connected');
    } catch (err) {
      this.connection = null;
      this.channel = null;
      this.logger.warn(
        `RabbitMQ connection failed (${(err as Error).message}); retrying in ${RECONNECT_BACKOFF_MS}ms`,
      );
      throw err;
    }
  }

  /** Publishes a JSON payload to a module-local queue. */
  async publish(queue: string, payload: unknown): Promise<void> {
    const { channel } = await this.ensureConnected();
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
    });
  }

  /** Subscribes to a queue and calls handler with ack/nack helpers. */
  async subscribe(queue: string, handler: QueueConsumerHandler): Promise<void> {
    const { channel } = await this.ensureConnected();
    const onMessage = (msg: ConsumeMessage | null): void => {
      if (!msg) return;
      const ack = () => channel.ack(msg);
      const nack = (requeue = false) => channel.nack(msg, false, requeue);
      void Promise.resolve(handler(msg, ack, nack)).catch(() => nack(false));
    };
    await channel.consume(queue, onMessage);
  }
}
