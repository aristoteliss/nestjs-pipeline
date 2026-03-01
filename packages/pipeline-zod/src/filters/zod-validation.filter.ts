import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ZodValidationError } from '../errors/zod-validation.error';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string;
  details: ZodValidationError['details'];
};

type HttpResponse = { status(code: number): { json(body: ErrorResponseBody): void } };

/**
 * Catches {@link ZodValidationError} thrown by both `createRequest()` constructors
 * and {@link ZodValidationBehavior} at the pipeline boundary, mapping them to HTTP 400.
 */
@Catch(ZodValidationError)
export class ZodValidationFilter implements ExceptionFilter {
  catch(exception: ZodValidationError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: exception.message,
      details: exception.details,
    });
  }
}
