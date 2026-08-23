import { HttpException, HttpStatus } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { ZodError } from 'zod';
import type { Problem } from '@kithlink/contracts';

export function problem(status: number, title: string, detail?: string): Problem {
  return detail === undefined
    ? { type: 'about:blank', title, status }
    : { type: 'about:blank', title, status, detail };
}

export function zodIssuesToDetail(err: ZodError): string {
  return err.issues.map(i => `${i.path.join('.') || '(body)'}: ${i.message}`).join('; ');
}

function isZodError(e: unknown): e is ZodError {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { name?: unknown }).name === 'ZodError' &&
    Array.isArray((e as { issues?: unknown }).issues)
  );
}

export function exceptionToProblem(exception: unknown): Problem {
  if (isZodError(exception)) {
    return problem(HttpStatus.BAD_REQUEST, 'Validation failed', zodIssuesToDetail(exception));
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    let detail = exception.message;
    if (typeof response === 'string') {
      detail = response;
    } else if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = (response as { message?: unknown }).message;
      if (typeof message === 'string') detail = message;
      else if (Array.isArray(message)) detail = message.filter((m): m is string => typeof m === 'string').join('; ');
    }
    return problem(status, STATUS_CODES[status] ?? 'Error', detail);
  }
  return problem(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
}
