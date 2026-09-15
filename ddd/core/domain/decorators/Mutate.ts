/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Method } from '../../types/Method.type';

/**
 * Method decorator that invokes the entity's `onUpdate()` hook after the
 * decorated method runs.
 *
 * Works for both synchronous and `Promise`-returning methods: for async methods
 * the hook fires after the promise resolves, and the original return value is
 * preserved. Use it on entity mutation methods to keep update bookkeeping (e.g.
 * timestamps) in one place.
 */
export function Mutate(): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as Method;

    descriptor.value = function (...args: unknown[]): unknown {
      const result = original.apply(this, args);
      const entity = this as { onUpdate?: () => void };

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then((value) => {
          entity.onUpdate?.();
          return value;
        });
      }

      entity.onUpdate?.();
      return result;
    };

    return descriptor;
  };
}
