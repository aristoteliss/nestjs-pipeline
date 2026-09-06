import type { ArgumentsHost } from '@nestjs/common';
import { FeatureDisabledError } from '@nestjs-pipeline/feature-flags';
import { describe, expect, it, vi } from 'vitest';
import { FeatureDisabledFilter } from './feature-disabled.filter';

function makeHost(response: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('FeatureDisabledFilter', () => {
  const error = new FeatureDisabledError(
    'user-registration',
    'CreateUserCommand',
  );

  it('uses Express json()', () => {
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    new FeatureDisabledFilter().catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 403,
      error: 'Forbidden',
      message: error.message,
      flag: 'user-registration',
    });
  });

  it('uses Fastify send() when json() is unavailable', () => {
    const response = { status: vi.fn(), send: vi.fn() };
    response.status.mockReturnValue(response);

    new FeatureDisabledFilter().catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith({
      statusCode: 403,
      error: 'Forbidden',
      message: error.message,
      flag: 'user-registration',
    });
  });
});
