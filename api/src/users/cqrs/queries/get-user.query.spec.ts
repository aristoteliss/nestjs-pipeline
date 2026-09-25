/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { GetUserQuery } from './get-user.query';

describe('GetUserQuery validation', () => {
  const validUuid = '019488e0-0000-7000-8000-000000000001';

  it('accepts valid query with userId only', () => {
    const query = new GetUserQuery({ userId: validUuid });
    expect(query.userId).toBe(validUuid);
    expect(query.email).toBeUndefined();
  });

  it('accepts valid query with email only', () => {
    const query = new GetUserQuery({ email: 'user@example.test' });
    expect(query.email).toBe('user@example.test');
    expect(query.userId).toBeUndefined();
  });

  it('throws validation error when both userId and email are supplied', () => {
    try {
      new GetUserQuery({
        userId: validUuid,
        email: 'user@example.test',
      });
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ZodValidationError');
      expect(err.details.fieldErrors.userId).toContain(
        'Provide either userId or email, not both.',
      );
      expect(err.details.fieldErrors.email).toContain(
        'Provide either userId or email, not both.',
      );
    }
  });

  it('throws validation error when neither userId nor email is supplied', () => {
    try {
      new GetUserQuery({});
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ZodValidationError');
      expect(err.details.fieldErrors.userId).toContain(
        'Either userId or email is required.',
      );
    }
  });
});
