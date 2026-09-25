/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { ArgumentsHost } from '@nestjs/common';
import { OPTIONAL_DEPS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { FeatureDisabledError } from '../errors/feature-disabled.error';
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

  it('answers 403 when the status is set explicitly', () => {
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    new FeatureDisabledFilter({ status: 403 }).catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ flag: 'user-registration' }),
    );
  });

  it('hides the feature behind a plain 404 that names neither the flag nor the request', () => {
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    new FeatureDisabledFilter({ status: 404 }).catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found',
    });
    const body = JSON.stringify(response.json.mock.calls[0][0]);
    expect(body).not.toContain('user-registration');
    expect(body).not.toContain('CreateUserCommand');
  });

  it('marks its options parameter optional, so APP_FILTER useClass needs no provider for it', () => {
    expect(
      Reflect.getMetadata(OPTIONAL_DEPS_METADATA, FeatureDisabledFilter),
    ).toEqual([0]);
  });
});
