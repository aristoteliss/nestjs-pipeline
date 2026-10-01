/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { InvalidJobContextError } from '../errors/invalid-job-context.error.js';
import { MissingJobContextError } from '../errors/missing-job-context.error.js';
import { parseJobContext } from './parse-job-context.js';

const tenants = ['tenant_a', 'tenant_b'];
const accepts = (id: string) =>
  id.length <= 128 && /^[A-Za-z0-9._~:/+=@-]+$/.test(id);
const valid = {
  tenantId: 'tenant_a',
  correlationId: 'corr-1',
  principal: { id: 'u-1', type: 'user', sessionId: 's-1' },
};

describe('parseJobContext', () => {
  it('returns a valid context', () => {
    expect(parseJobContext(valid, tenants, accepts)).toEqual(valid);
  });

  it('accepts a principal without a session', () => {
    const context = { ...valid, principal: { id: 'svc', type: 'service' } };

    expect(parseJobContext(context, tenants, accepts).principal).toEqual({
      id: 'svc',
      type: 'service',
    });
  });

  it('reports a payload without a context as missing', () => {
    expect(() => parseJobContext(undefined, tenants, accepts)).toThrow(
      MissingJobContextError,
    );
  });

  it.each([
    ['null', null, 'jobContext is not an object'],
    ['an array', [valid], 'jobContext is not an object'],
    [
      'an unknown field',
      { ...valid, user: {} },
      'jobContext carries the field "user"',
    ],
    [
      'an unconfigured tenant',
      { ...valid, tenantId: 'tenant_c' },
      'tenantId is not a configured tenant',
    ],
    [
      'a non-string tenant',
      { ...valid, tenantId: 1 },
      'tenantId is not a configured tenant',
    ],
    [
      'a non-string correlation id',
      { ...valid, correlationId: 1 },
      'correlationId is malformed',
    ],
    [
      'a correlation id with spaces',
      { ...valid, correlationId: 'a b' },
      'correlationId is malformed',
    ],
    [
      'an overlong correlation id',
      { ...valid, correlationId: 'a'.repeat(129) },
      'correlationId is malformed',
    ],
    [
      'a missing principal',
      { ...valid, principal: undefined },
      'principal is not an object',
    ],
    [
      'a principal with grants',
      { ...valid, principal: { ...valid.principal, grants: ['all|manage'] } },
      'principal carries the field "grants"',
    ],
    [
      'a blank principal id',
      { ...valid, principal: { id: ' ', type: 'user' } },
      'principal is malformed',
    ],
    [
      'a missing principal type',
      { ...valid, principal: { id: 'u-1' } },
      'principal is malformed',
    ],
    [
      'a non-string session id',
      { ...valid, principal: { id: 'u-1', type: 'user', sessionId: 7 } },
      'principal is malformed',
    ],
  ])('refuses %s', (_case, value, reason) => {
    expect(() => parseJobContext(value, tenants, accepts)).toThrow(
      new InvalidJobContextError(reason),
    );
  });
});
