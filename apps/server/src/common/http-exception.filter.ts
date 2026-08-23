import { ArgumentsHost, Catch, ConsoleLogger, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { exceptionToProblem } from './problem.util';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new ConsoleLogger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<{ originalUrl?: string }>();
    const body = exceptionToProblem(exception);
    if (body.status >= 500) {
      this.logger.error(body.title, exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(body.status).type('application/problem+json').json({ ...body, instance: req.originalUrl });
  }
}
