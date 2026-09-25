/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Method } from '../../types/Method.type';
import { IEvent } from '../events/event.interface';

/**
 * The state change a domain method describes: mutable field keys mapped to
 * their new values for `RootEntity.applyPatch()`. Undefined values are ignored.
 * An absent patch leaves fields unchanged.
 *
 * @typeParam TEntity - The aggregate the patch applies to.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: supports an absent mutation patch
export type MutationPatch<TEntity> = Partial<TEntity> | void;

/** A non-empty array of domain events. */
export type NonEmptyEventArray =
  | readonly [IEvent, ...IEvent[]]
  | [IEvent, ...IEvent[]];

export type SingleEvent = IEvent & { length?: never };

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
  for (const method of ['onUpdate', 'apply'] as const) {
    if (
      typeof (entity as Partial<MutableTarget> | null)?.[method] !== 'function'
    ) {
      throw new TypeError(
        `@ApplyMutation requires target instance to implement callable ${method}() method.`,
      );
    }
  }
}

function completeMutation<TEntity>(
  entity: MutableTarget,
  result: unknown,
  options: ApplyMutationOptions<TEntity>,
): unknown {
  entity.onUpdate();

  const eventOrEvents = options.event(entity as TEntity);

  if (!Array.isArray(eventOrEvents)) {
    if (eventOrEvents === null || typeof eventOrEvents !== 'object') {
      throw new TypeError(
        `@ApplyMutation event factory must return a domain event object or non-empty array of events, received: ${String(eventOrEvents)}.`,
      );
    }
    entity.apply(eventOrEvents);
    return result;
  }

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
  }
  for (const evt of eventOrEvents) {
    entity.apply(evt);
  }

  return result;
}

/**
 * Completes a successful domain mutation by advancing `onUpdate()` once and
 * recording events from the resulting state. Preserves the method's return value,
 * including an entity returned by an asynchronous method.
 *
 * Domain methods validate inputs, call `this.applyPatch(...)` for mutable fields,
 * and return `this`. They must not apply events or advance lifecycle state directly.
 * Lifecycle operations are checked before invoking the method.
 *
 * Patch validation and normalization finish before that patch writes any fields.
 * Failures after a successful patch (including later method code, lifecycle hooks,
 * or event construction/application) do not roll back state: discard or reload
 * the aggregate. Rejected methods do not run the completion lifecycle.
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
 *   rename(name: string): this {
 *     this.applyPatch({ username: name });
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
        return (result as Promise<unknown>).then((value) =>
          completeMutation(entity, value, options),
        );
      }

      return completeMutation(entity, result, options);
    };

    return descriptor;
  };
}
