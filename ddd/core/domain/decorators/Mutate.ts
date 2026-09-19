/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Method } from '../../types/Method.type';

/**
 * Marks a domain mutation so the entity's `onUpdate()` lifecycle hook runs
 * after the mutation succeeds.
 *
 * For synchronous methods the hook runs after the method returns. For async
 * methods it runs only after the returned promise resolves; rejected mutations
 * do not advance timestamps/version bookkeeping. The original return value is
 * preserved.
 *
 * Use this on domain methods that change aggregate state. Do not use it on
 * rehydration/setter paths that restore persisted state.
 *
 * @returns A method decorator preserving the decorated method's result.
 *
 * @example
 * ```ts
 * export class User extends RootEntity<UserSnapshot> {
 *   @Mutate()
 *   rename(name: string): this {
 *     this._name = name.trim();
 *     this.apply(new UserRenamedEvent(this));
 *     return this;
 *   }
 * }
 * ```
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
