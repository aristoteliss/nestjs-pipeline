/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { ArgumentsHost } from '@nestjs/common';
import { UnauthorizedActionException } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
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
});
