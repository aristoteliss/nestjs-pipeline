/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Method } from '../../types/Method.type';
import { IEvent } from '../events/event.interface';
import { UnknownMutableFieldError } from '../exceptions/unknown-mutable-field.error';
import { getMutableFields } from './Mutable';

/**
 * The state change a domain method describes: mutable field keys mapped to
 * their new values. `undefined` values are ignored, so a partial update can be
 * expressed without branching per field. Returning nothing describes a
 * mutation that advances the aggregate lifecycle without changing any field
 * (a deletion, for instance).
 *
 * @typeParam TEntity - The aggregate the patch applies to.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void allows parameterless delete methods returning nothing
export type MutationPatch<TEntity> = Partial<TEntity> | void;

/**
 * Configuration for a declarative aggregate mutation and domain event application.
 *
 * @typeParam TEntity - The aggregate the decorated method belongs to.
 */
export interface ApplyMutationOptions<TEntity> {
  /**
   * Factory for the domain event(s) recorded once the mutation has completed.
   * It receives the aggregate **after** the patch, `onUpdate()` and the
   * version/timestamp advance, ensuring event payload and metadata snapshot
   * the post-mutation version and `updatedAt`.
   */
  readonly event: (entity: TEntity) => IEvent | IEvent[];
}

type MutableTarget = {
  onUpdate?: () => void;
  apply?: (event: IEvent) => void;
};

function applyPatch(entity: object, patch: unknown): unknown {
  if (patch === undefined || patch === null) {
    return patch;
  }
  if (typeof patch !== 'object') {
    throw new TypeError(
      '@ApplyMutation() methods return a field patch object, or nothing.',
    );
  }

  const fields = getMutableFields(entity);
  const writes: Array<[string, unknown]> = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    const field = fields.get(key);
    if (!field) {
      throw new UnknownMutableFieldError(entity.constructor.name, key, [
        ...fields.keys(),
      ]);
    }
    writes.push([
      field.propertyKey,
      field.normalize ? field.normalize(value) : value,
    ]);
  }

  for (const [propertyKey, value] of writes) {
    (entity as Record<string, unknown>)[propertyKey] = value;
  }

  return patch;
}

function completeMutation<TEntity>(
  entity: MutableTarget,
  patch: unknown,
  options: ApplyMutationOptions<TEntity>,
): unknown {
  const applied = applyPatch(entity, patch);
  entity.onUpdate?.();
  if (options.event) {
    const eventOrEvents = options.event(entity as TEntity);
    if (Array.isArray(eventOrEvents)) {
      for (const evt of eventOrEvents) {
        if (evt) {
          entity.apply?.(evt);
        }
      }
    } else if (eventOrEvents) {
      entity.apply?.(eventOrEvents);
    }
  }
  return applied;
}

/**
 * Turns a domain method into a complete aggregate mutation: it applies the
 * returned field patch through the fields declared with `@Mutable()`, runs the
 * entity's `onUpdate()` lifecycle once, and records the configured domain event(s)
 * from the resulting post-mutation state.
 *
 * The method body is left with the part that is actually domain logic —
 * validation and deciding the new values. It never assigns backing fields, never
 * calls `apply()` and never touches version or timestamp bookkeeping, guaranteeing
 * that an event cannot be constructed from a pre-mutation snapshot and a mutation
 * cannot silently skip its event.
 *
 * Ordering is: method body (may throw and abort everything) → patch applied and
 * normalized → `onUpdate()` (version + `updatedAt`) → event constructed from the
 * post-mutation aggregate and applied. For async methods every step after the
 * body runs only once the returned promise resolves; a rejected mutation leaves
 * the aggregate untouched.
 *
 * @typeParam TEntity - The aggregate the decorated method belongs to.
 * @param options - The domain event(s) factory to record for this mutation.
 * @returns A method decorator that performs the full mutation lifecycle.
 *
 * @example
 * ```ts
 * export class User extends RootEntity<UserSnapshot> {
 *   @Mutable<string>({ normalize: (value) => User.normalizeUsername(value) })
 *   private _username: string;
 *
 *   @ApplyMutation<User>({ event: (user) => new UserRenamedEvent(user) })
 *   rename(name: string): MutationPatch<User> {
 *     return { username: name };
 *   }
 * }
 * ```
 */
export function ApplyMutation<TEntity = unknown>(
  options: ApplyMutationOptions<TEntity>,
): MethodDecorator {
  if (!options || typeof options.event !== 'function') {
    throw new TypeError(
      '@ApplyMutation requires an event factory option: @ApplyMutation({ event: (entity) => ... }).',
    );
  }

  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as Method;

    descriptor.value = function (...args: unknown[]): unknown {
      const entity = this as MutableTarget;
      const result = original.apply(this, args);

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then((patch) =>
          completeMutation(entity, patch, options),
        );
      }

      return completeMutation(entity, result, options);
    };

    return descriptor;
  };
}
