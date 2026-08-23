import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ProblemFilter } from './common/http-exception.filter';
import { MailDispatcher } from './modules/notifications/notifications.module';
import { SyncService } from './modules/sync/sync.service';

const SYNC_CRON_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startSyncCron(app: INestApplication): void {
  if (process.env.ENABLE_SYNC_CRON !== '1') return;
  const sync = app.get(SyncService);
  const timer = setInterval(() => {
    sync.runAllLive('cron').catch((error: unknown) => {
      console.error('[sync] nightly run failed', error);
    });
  }, SYNC_CRON_INTERVAL_MS);
  timer.unref();
  console.log('[sync] nightly cron enabled (24h interval)');
}

export function configureApp(app: NestExpressApplication): void {
  app.use(helmet());
  const origins = [process.env.APP_URL, process.env.ADMIN_URL]
    .flatMap(value => (value ? value.split(',') : []))
    .map(origin => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.use(cookieParser());
  app.useGlobalFilters(new ProblemFilter());
}

async function bootstrap(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.get(MailDispatcher).start(Number(process.env.OUTBOX_INTERVAL_MS) || 10_000);
  await app.listen(Number(process.env.API_PORT) || 4000);
  startSyncCron(app);
}

if (require.main === module) {
  bootstrap().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
