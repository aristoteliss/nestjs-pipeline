/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedActionException } from '../errors/unauthorized-action.exception';
import { buildAbility } from '../helpers/ability';
import { CaslAuthorizer } from '../helpers/authorizer';
import { UnauthorizedActionFilter } from './unauthorized-action.filter';

describe('UnauthorizedActionFilter', () => {
  it('maps UnauthorizedActionException to HTTP 403 Forbidden with details', () => {
    const filter = new UnauthorizedActionFilter();
    const exception = new UnauthorizedActionException({
      action: 'delete',
      subject: 'User',
      entityId: '123',
      fields: ['department'],
    });

    const statusFn = vi.fn().mockReturnThis();
    const jsonFn = vi.fn();

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: statusFn,
          json: jsonFn,
        }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        error: 'Forbidden',
        action: 'delete',
        subject: 'User',
      }),
    );
  });

  it('uses Fastify send() when json() is unavailable', () => {
    const exception = new UnauthorizedActionException({
      action: 'update',
      subject: 'Role',
    });
    const statusFn = vi.fn().mockReturnThis();
    const sendFn = vi.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn, send: sendFn }),
      }),
    } as unknown as ArgumentsHost;

    new UnauthorizedActionFilter().catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(403);
    expect(sendFn).toHaveBeenCalledWith({
      statusCode: 403,
      error: 'Forbidden',
      message: exception.message,
      action: 'update',
      subject: 'Role',
    });
  });

  it('catches exception thrown directly by CaslAuthorizer', () => {
    const filter = new UnauthorizedActionFilter();
    const authorizer = new CaslAuthorizer(buildAbility([])); // empty permissions

    let caughtException: unknown;
    try {
      authorizer.authorize('delete', { id: '456' });
    } catch (err) {
      caughtException = err;
    }

    expect(caughtException).toBeInstanceOf(UnauthorizedActionException);

    const statusFn = vi.fn().mockReturnThis();
    const jsonFn = vi.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: statusFn,
          json: jsonFn,
        }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(caughtException as UnauthorizedActionException, host);
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        error: 'Forbidden',
        action: 'delete',
      }),
    );
  });
});
