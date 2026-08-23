import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { ParseProcessor } from './processor';

export const PARSE_QUEUE_NAME = 'verify.parse';

export interface ParseJobData {
  artifactId: string;
}

@Injectable()
export class ParseQueue implements OnApplicationShutdown {
  private queue: Queue<ParseJobData> | null = null;
  private connection: Redis | null = null;

  constructor(
    @Inject(ParseProcessor) private readonly processor: ParseProcessor,
  ) {}

  private ensureQueue(): Queue<ParseJobData> | null {
    if (this.queue) return this.queue;
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return null;
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<ParseJobData>(PARSE_QUEUE_NAME, { connection: this.connection });
    return this.queue;
  }

  async enqueue(artifactId: string): Promise<void> {
    const queue = this.ensureQueue();
    if (queue) {
      await queue.add('parse', { artifactId }, { attempts: 3, removeOnComplete: true, removeOnFail: 100 });
      return;
    }
    await this.processor.process({ artifactId });
  }

  createWorkerConnection(): Redis {
    return new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  }

  get hasRedis(): boolean {
    return Boolean(process.env.REDIS_URL);
  }

  onApplicationShutdown(): Promise<void> {
    return Promise.all([
      this.queue?.close(),
      this.connection?.quit().catch(() => undefined),
    ]).then(() => undefined);
  }
}
