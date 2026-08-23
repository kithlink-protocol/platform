import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import { ParseProcessor } from './modules/parse/processor';
import { ParseQueue, PARSE_QUEUE_NAME } from './modules/parse/queue';

async function bootstrap(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  if (!process.env.REDIS_URL) {
    console.error('REDIS_URL is required for worker-verify');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule);
  const processor = app.get(ParseProcessor);
  const parseQueue = app.get(ParseQueue);
  const worker = new Worker(PARSE_QUEUE_NAME, job => processor.process(job.data), {
    connection: parseQueue.createWorkerConnection(),
    concurrency: Number(process.env.VERIFY_CONCURRENCY) || 4,
  });
  worker.on('failed', (job, error) => {
    console.error(`[worker-verify] job ${job?.id ?? '?'} failed`, error);
  });
  console.log(`[worker-verify] consuming ${PARSE_QUEUE_NAME}`);
}

bootstrap().catch(error => {
  console.error(error);
  process.exit(1);
});
