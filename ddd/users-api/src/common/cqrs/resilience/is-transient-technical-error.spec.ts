import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { isTransientTechnicalError } from './is-transient-technical-error';

describe('isTransientTechnicalError', () => {
  it.each([
    new ForbiddenException(),
    new NotFoundException(),
    new ConflictException(),
    new Error('programmer error'),
  ])('does not retry deterministic failures without a transient code', (error) => {
    expect(isTransientTechnicalError(error)).toBe(false);
  });

  it.each(['40001', '40P01', 'ECONNRESET', 'SQLITE_BUSY', '08006', '53000'])(
    'retries transient technical code %s',
    (code) => {
      expect(isTransientTechnicalError({ code })).toBe(true);
    },
  );

  it.each(['TaskCancelledError', 'TimeoutError'])(
    'retries transient technical error name %s',
    (name) => {
      expect(isTransientTechnicalError({ name })).toBe(true);
    },
  );

  it('recognizes a transient nested cause', () => {
    expect(
      isTransientTechnicalError({ cause: { code: 'ETIMEDOUT' } }),
    ).toBe(true);
  });
});
