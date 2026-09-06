import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { isTransientPersistenceError } from './is-transient-persistence-error';

describe('isTransientPersistenceError', () => {
  it.each([
    new ForbiddenException(),
    new NotFoundException(),
    new ConflictException(),
  ])('does not retry deterministic HTTP failures', (error) => {
    expect(isTransientPersistenceError(error)).toBe(false);
  });

  it.each(['40001', '40P01', 'ECONNRESET', 'SQLITE_BUSY'])(
    'retries transient persistence code %s',
    (code) => {
      expect(isTransientPersistenceError({ code })).toBe(true);
    },
  );

  it('recognizes a transient nested cause', () => {
    expect(isTransientPersistenceError({ cause: { code: 'ETIMEDOUT' } })).toBe(
      true,
    );
  });
});
