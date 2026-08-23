import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ProblemFilter } from './common/http-exception.filter';

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
  await app.listen(Number(process.env.API_PORT) || 4000);
}

if (require.main === module) {
  bootstrap().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
