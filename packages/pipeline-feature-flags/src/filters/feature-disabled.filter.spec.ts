/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { ArgumentsHost } from '@nestjs/common';
import { OPTIONAL_DEPS_METADATA } from '@nestjs/common/constants';
import type { HttpAdapterHost } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { FeatureDisabledError } from '../errors/feature-disabled.error.js';
import {
  FeatureDisabledFilter,
  type FeatureDisabledFilterOptions,
} from './feature-disabled.filter.js';

const response = {};
const host = {
  switchToHttp: () => ({ getResponse: () => response }),
} as unknown as ArgumentsHost;

function createFilter(options?: FeatureDisabledFilterOptions) {
  const reply = vi.fn();
  const filter = new FeatureDisabledFilter(
    { httpAdapter: { reply } } as unknown as HttpAdapterHost,
    options,
  );
  return { filter, reply };
}

describe('FeatureDisabledFilter', () => {
  const error = new FeatureDisabledError(
    'user-registration',
    'CreateUserCommand',
  );

  it('answers 403 naming the flag by default', () => {
    const { filter, reply } = createFilter();

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: 403,
        error: 'Forbidden',
        message: error.message,
        flag: 'user-registration',
      },
      403,
    );
  });

  it('answers 403 when the status is set explicitly', () => {
    const { filter, reply } = createFilter({ status: 403 });

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ flag: 'user-registration' }),
      403,
    );
  });

  it('hides the feature behind a plain 404 that names neither the flag nor the request', () => {
    const { filter, reply } = createFilter({ status: 404 });

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      { statusCode: 404, error: 'Not Found', message: 'Not Found' },
      404,
    );
    const body = JSON.stringify(reply.mock.calls[0][1]);
    expect(body).not.toContain('user-registration');
    expect(body).not.toContain('CreateUserCommand');
  });

  it('marks its options parameter optional, so APP_FILTER useClass needs no provider for it', () => {
    expect(
      Reflect.getMetadata(OPTIONAL_DEPS_METADATA, FeatureDisabledFilter),
    ).toEqual([1]);
  });
});
