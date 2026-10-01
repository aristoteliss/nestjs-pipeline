/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedActionException } from '../errors/unauthorized-action.exception';
import { buildAbility } from '../helpers/ability';
import { CaslAuthorizer } from '../helpers/authorizer';
import { UnauthorizedActionFilter } from './unauthorized-action.filter';

const response = {};
const host = {
  switchToHttp: () => ({ getResponse: () => response }),
} as unknown as ArgumentsHost;

function createFilter() {
  const reply = vi.fn();
  const filter = new UnauthorizedActionFilter({
    httpAdapter: { reply },
  } as unknown as HttpAdapterHost);
  return { filter, reply };
}

describe('UnauthorizedActionFilter', () => {
  it('maps UnauthorizedActionException to HTTP 403 Forbidden with details', () => {
    const { filter, reply } = createFilter();
    const exception = new UnauthorizedActionException({
      action: 'delete',
      subject: 'User',
      entityId: '123',
      fields: ['department'],
    });

    filter.catch(exception, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: 403,
        error: 'Forbidden',
        message: exception.message,
        action: 'delete',
        subject: 'User',
      },
      403,
    );
  });

  it('catches exception thrown directly by CaslAuthorizer', () => {
    const { filter, reply } = createFilter();
    const authorizer = new CaslAuthorizer(buildAbility([]));

    let caughtException: unknown;
    try {
      authorizer.authorize('delete', { id: '456' });
    } catch (err) {
      caughtException = err;
    }

    expect(caughtException).toBeInstanceOf(UnauthorizedActionException);

    filter.catch(caughtException as UnauthorizedActionException, host);
    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({
        statusCode: 403,
        error: 'Forbidden',
        action: 'delete',
      }),
      403,
    );
  });
});
