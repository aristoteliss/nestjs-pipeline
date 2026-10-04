/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { describe, expect, it } from 'vitest';
import { GetUserPermissionRulesQuery } from './get-user-permission-rules.query.js';

describe('GetUserPermissionRulesQuery validation', () => {
  it('accepts a valid query with a string userId', () => {
    const query = new GetUserPermissionRulesQuery({ userId: 'user-1' });
    expect(query.userId).toBe('user-1');
  });

  it('accepts a valid query with a numeric userId', () => {
    const query = new GetUserPermissionRulesQuery({ userId: 42 });
    expect(query.userId).toBe(42);
  });

  it('accepts query options such as refresh', () => {
    const query = new GetUserPermissionRulesQuery(
      { userId: 'user-1' },
      { refresh: true },
    );
    expect(query.userId).toBe('user-1');
    expect(query.refresh).toBe(true);
  });

  it('rejects an empty string userId', () => {
    expect(() => new GetUserPermissionRulesQuery({ userId: '' })).toThrow(
      ZodValidationError,
    );
  });

  it('rejects a missing userId', () => {
    expect(() => new GetUserPermissionRulesQuery({} as never)).toThrow(
      ZodValidationError,
    );
  });

  it('rejects an invalid type for userId', () => {
    expect(
      () => new GetUserPermissionRulesQuery({ userId: true as never }),
    ).toThrow(ZodValidationError);
  });
});
