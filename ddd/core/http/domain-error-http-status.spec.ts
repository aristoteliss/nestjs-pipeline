/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../domain/exceptions/concurrency-conflict.error';
import { DomainException } from '../domain/exceptions/domain.exception';
import { EntityNotFoundException } from '../domain/exceptions/entity-not-found.exception';
import { MissingTenantContextError } from '../domain/exceptions/missing-tenant-context.exception';
import { TransientOperationError } from '../domain/exceptions/transient-operation.error';
import { domainErrorHttpStatus } from './domain-error-http-status';

class InvariantViolated extends DomainException {}

class OrderNotFound extends EntityNotFoundException {
  constructor(id: string) {
    super('Order', id);
  }
}

describe('domainErrorHttpStatus', () => {
  it('answers 409 with the message for a concurrency conflict', () => {
    const error = new ConcurrencyConflictError('User', 'u-1', 3, 4);

    expect(domainErrorHttpStatus(error)).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: error.message,
    });
  });

  it('answers 404 with the message for a missing entity, subclasses included', () => {
    expect(domainErrorHttpStatus(new EntityNotFoundException('User'))).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    });
    expect(domainErrorHttpStatus(new OrderNotFound('o-1')).statusCode).toBe(
      404,
    );
  });

  it('answers a generic 500 for a missing tenant and keeps the developer message out', () => {
    const mapped = domainErrorHttpStatus(
      new MissingTenantContextError('cache key derivation'),
    );

    expect(mapped).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
  });

  it('answers 400 with the message for any other domain exception', () => {
    expect(
      domainErrorHttpStatus(new InvariantViolated('Quantity must be positive')),
    ).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Quantity must be positive',
    });
  });

  it('types the result of a DomainException as always defined', () => {
    const mapped = domainErrorHttpStatus(new InvariantViolated('invalid'));

    expect(mapped.statusCode).toBe(400);
  });

  it.each([
    ['a plain Error', new Error('boom')],
    ['a transient operation error', new TransientOperationError('retry me')],
    ['a string', 'boom'],
    ['undefined', undefined],
  ])('leaves %s to the framework', (_label, error) => {
    expect(domainErrorHttpStatus(error)).toBeUndefined();
  });
});
