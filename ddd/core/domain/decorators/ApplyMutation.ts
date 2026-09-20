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
export type NonEmptyEventArray =
  | readonly [IEvent, ...IEvent[]]
  | [IEvent, ...IEvent[]];

export type SingleEvent = IEvent & { length?: never };

export interface ApplyMutationOptions<TEntity> {
  /**
   * Factory for the domain event(s) recorded once the mutation has completed.
   * It receives the aggregate **after** the patch, `onUpdate()` and the
   * version/timestamp advance, ensuring event payload and metadata snapshot
   * the post-mutation version and `updatedAt`.
   *
   * Must return a single domain event object or a non-empty array of domain events.
   */
  readonly event: (entity: TEntity) => SingleEvent | NonEmptyEventArray;
}

type MutableTarget = {
  onUpdate: () => void;
  apply: (event: IEvent) => void;
};

function assertLifecycleOperations(
  entity: unknown,
): asserts entity is MutableTarget {
  if (
    !entity ||
    typeof (entity as { onUpdate?: unknown }).onUpdate !== 'function'
  ) {
    throw new TypeError(
      '@ApplyMutation requires target instance to implement callable onUpdate() method.',
    );
  }
  if (typeof (entity as { apply?: unknown }).apply !== 'function') {
    throw new TypeError(
      '@ApplyMutation requires target instance to implement callable apply() method.',
    );
  }
}

function applyPatch(entity: object, patch: unknown): unknown {
  if (patch === undefined || patch === null) {
    return undefined;
  }
  if (typeof patch !== 'object') {
    throw new TypeError(
      '@ApplyMutation() methods return a field patch object, or nothing.',
    );
  }

  const fields = getMutableFields(entity);
  const writes: Array<{
    propertyKey: string;
    value: unknown;
    patchKey: string;
  }> = [];

  // Phase 1: validate all keys and normalize values before any state changes
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
    const normalizedValue = field.normalize ? field.normalize(value) : value;
    writes.push({
      propertyKey: field.propertyKey,
      value: normalizedValue,
      patchKey: key,
    });
  }

  // Phase 2: apply normalized writes to backing properties
  const appliedPatch: Record<string, unknown> = {};
  for (const { propertyKey, value, patchKey } of writes) {
    (entity as Record<string, unknown>)[propertyKey] = value;
    appliedPatch[patchKey] = value;
  }

  return appliedPatch;
}

function completeMutation<TEntity>(
  entity: MutableTarget,
  patch: unknown,
  options: ApplyMutationOptions<TEntity>,
): unknown {
  const applied = applyPatch(entity, patch);
  entity.onUpdate();

  const eventOrEvents = options.event(entity as TEntity);
  const eventsToApply: IEvent[] = [];

  if (Array.isArray(eventOrEvents)) {
    if (eventOrEvents.length === 0) {
      throw new TypeError(
        '@ApplyMutation event factory must return at least one domain event.',
      );
    }
    for (let i = 0; i < eventOrEvents.length; i++) {
      const evt = eventOrEvents[i];
      if (evt === null || typeof evt !== 'object') {
        throw new TypeError(
          `@ApplyMutation event factory returned an invalid event at index ${i}. Expected an event object, received: ${String(evt)}.`,
        );
      }
      eventsToApply.push(evt as IEvent);
    }
  } else {
    if (eventOrEvents === null || typeof eventOrEvents !== 'object') {
      throw new TypeError(
        `@ApplyMutation event factory must return a domain event object or non-empty array of events, received: ${String(eventOrEvents)}.`,
      );
    }
    eventsToApply.push(eventOrEvents as IEvent);
  }

  for (const evt of eventsToApply) {
    entity.apply(evt);
  }

  return applied;
}

/**
 * Turns a domain method into a complete aggregate mutation: it applies the
 * returned field patch through the fields declared with `@Mutable()`, runs the
 * entity's `onUpdate()` lifecycle once, and records the configured domain event(s)
 * from the resulting post-mutation state.
 *
 * The method body describes the domain change — validation and proposed new values.
 * In accordance with repository architecture rules, method bodies follow the pure
 * patch-producing convention: they do not mutate backing fields directly, do not call
 * `apply()`, and do not touch version or timestamp bookkeeping.
 *
 * **Failure contract:**
 * - **Pre-application rejection**: Unknown patch keys, field normalizer rejections,
 *   invalid patch types, and missing lifecycle operations abort before any state change.
 *   The aggregate fields, version, timestamp, baseline, and event buffer remain untouched.
 * - **Post-application failure**: If a failure occurs after field application begins
 *   (such as a throwing `onUpdate()`/`afterUpdate()` hook, a throwing event factory, an
 *   invalid event collection, or a throwing `apply()` handler), the error propagates
 *   immediately. No generic rollback is attempted; callers must discard or reload the
 *   partially completed aggregate instance.
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
 *   protected applyRename(name: string): MutationPatch<User> {
 *     return { username: name };
 *   }
 *
 *   rename(name: string): this {
 *     this.applyRename(name);
 *     return this;
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
      assertLifecycleOperations(this);
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
