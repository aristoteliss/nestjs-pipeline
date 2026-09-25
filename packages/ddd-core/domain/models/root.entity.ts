/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';
import type { MutationPatch } from '../decorators/ApplyMutation';
import { getMutableFields } from '../decorators/Mutable';
import { UnknownMutableFieldError } from '../exceptions/unknown-mutable-field.error';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { AggregateRoot } from './aggregate-root';

/**
 * Abstract base entity for DDD domain aggregates and entities.
 *
 * Inherits from {@link AggregateRoot} to manage domain events
 * internally:
 * - **Domain Event Recording**: Call `this.apply(new SomeEvent(this))` to buffer uncommitted events.
 * - **UUID v7 Identity**: Automatically generates time-ordered UUID v7 identifiers for new instances.
 * - **Lifecycle Timestamps**: Enforces invariant-checked `createdAt` and `updatedAt` tracking.
 * - **Accessor-Driven Persistence**: Exposes typed getters and setters (`id`, `createdAt`, `updatedAt`)
 *   compatible with MikroORM `accessor: true` mapping. Setters are a hydration escape hatch;
 *   application mutations must use factories/domain methods, not these setters.
 * - **Optimistic Concurrency Control**: Tracks integer aggregate versioning (`_version`, {@link getExpectedVersion}),
 *   incremented automatically on mutations to prevent concurrent lost updates.
 * - **Polymorphic Rehydration**: Static `RootEntity.from()` transparently handles instances, plain snapshots,
 *   or nullish database results while enforcing strict aggregate type safety (throws `TypeError` on incompatible aggregates).
 * - **Mutation Tracking**: Automatically updates `updatedAt`, increments `_version` on `@ApplyMutation()`-decorated methods,
 *   and triggers the `afterUpdate()` lifecycle hook.
 *
 * @example Defining a domain aggregate
 * ```typescript
 * interface UserSnapshot extends Partial<RootEntitySnapshot> {
 *   readonly username: string;
 *   readonly email: string;
 *   readonly version?: number;
 * }
 *
 * export class User extends RootEntity<UserSnapshot> {
 *   @Mutable<string>()
 *   private _username: string;
 *   readonly email: string;
 *
 *   private constructor(snapshot: UserSnapshot) {
 *     super(snapshot);
 *     this._username = snapshot.username!;
 *     this.email = snapshot.email!;
 *   }
 *
 *   static create(username: string, email: string): User {
 *     const user = new User({ username, email });
 *     user.apply(new UserCreatedEvent(user));
 *     return user;
 *   }
 *
 *   static fromJSON(snapshot: UserSnapshot): User {
 *     return new User(snapshot);
 *   }
 *
 *   @ApplyMutation<User>({ event: (user) => new UserRenamedEvent(user) })
 *   rename(newUsername: string): this {
 *     this.applyPatch({ username: newUsername });
 *     return this;
 *   }
 *
 *   toJSON(): RootEntitySnapshot & UserSnapshot {
 *     return this.freezeState({
 *       id: this.id,
 *       username: this._username,
 *       email: this.email,
 *       createdAt: this.createdAt,
 *       updatedAt: this.updatedAt,
 *       version: this._version,
 *     });
 *   }
 * }
 * ```
 */
export abstract class RootEntity<
    TSnapshot extends Partial<RootEntitySnapshot> = RootEntitySnapshot,
  >
  extends AggregateRoot
  implements RootEntitySnapshot
{
  private _id: string;
  private _createdAt: Date;
  private _updatedAt: Date;
  protected _version: number;
  protected _persistedVersion: number;

  constructor(snapshot?: Partial<RootEntitySnapshot>) {
    super();
    const id = snapshot?.id;
    const createdAt = snapshot?.createdAt;
    const updatedAt = snapshot?.updatedAt;
    const version = snapshot?.version;

    this._version =
      typeof version === 'number' && Number.isInteger(version) && version > 0
        ? version
        : 1;
    this._persistedVersion = this._version;

    if (
      id !== undefined &&
      createdAt !== undefined &&
      updatedAt !== undefined
    ) {
      this._id = RootEntity.normalizeId(id);
      this._createdAt = RootEntity.normalizeDate(createdAt);
      this._updatedAt = RootEntity.normalizeDate(updatedAt);
      return;
    }

    if (
      id !== undefined ||
      createdAt !== undefined ||
      updatedAt !== undefined
    ) {
      throw new Error(
        'id, createdAt, and updatedAt must be provided together when rehydrating an entity.',
      );
    }

    const now = new Date();
    this._id = uuidv7();
    this._createdAt = now;
    this._updatedAt = now;
  }

  protected static normalizeId(id?: string): string {
    if (typeof id !== 'string' || !isUuidV7(id)) {
      throw new Error('id must be a valid UUID v7.');
    }
    return id.trim();
  }

  protected static normalizeDate(value?: Date | string): Date {
    if (value === undefined || value === null) {
      throw new Error('Date is empty.');
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      throw new Error('Date is empty.');
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() <= 1) {
      throw new Error('Date must be a valid non-empty date.');
    }
    return parsed;
  }

  /**
   * Rehydrates or returns an already-hydrated entity instance.
   *
   * If `candidate` is already an instance of the target entity class, it is returned as-is.
   * If `candidate` is an instance of an incompatible `RootEntity`, a `TypeError` is thrown.
   * Otherwise, if `candidate` is a snapshot object, it is rehydrated via the class's `fromJSON()` factory.
   */
  static from<
    T extends RootEntity<TSnapshot>,
    TSnapshot extends Partial<RootEntitySnapshot>,
  >(
    this:
      | { fromJSON(snapshot: TSnapshot): T }
      | (abstract new (
          ...args: unknown[]
        ) => T),
    candidate: T | TSnapshot | null | undefined,
  ): T | null {
    if (candidate === null || candidate === undefined) {
      return null;
    }
    // biome-ignore lint/complexity/noThisInStatic: Polymorphic static rehydration
    const targetClass = this as unknown as abstract new (...args: never[]) => T;
    if (typeof targetClass === 'function') {
      if (candidate instanceof targetClass) {
        return candidate as T;
      }
      if (candidate instanceof RootEntity) {
        const expectedName = targetClass.name || 'TargetEntity';
        const actualName = candidate.constructor?.name || 'RootEntity';
        throw new TypeError(
          `Cannot rehydrate entity: expected instance of ${expectedName}, received incompatible aggregate ${actualName}.`,
        );
      }
    } else if (candidate instanceof RootEntity) {
      return candidate as T;
    }
    // biome-ignore lint/complexity/noThisInStatic: Polymorphic static rehydration
    const ctor = this as unknown as { fromJSON(snapshot: TSnapshot): T };
    if (typeof ctor.fromJSON === 'function') {
      return ctor.fromJSON(candidate as TSnapshot);
    }
    throw new Error('Cannot rehydrate entity: missing fromJSON factory.');
  }

  get id(): string {
    return this._id;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * Application code changes aggregate state through domain methods and factories, never through this setter.
   */
  set id(value: string) {
    this._id = RootEntity.normalizeId(value);
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * Application code changes aggregate state through domain methods and factories, never through this setter.
   */
  set createdAt(value: Date | string) {
    this._createdAt = RootEntity.normalizeDate(value);
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * Application code changes aggregate state through domain methods and factories, never through this setter.
   */
  set updatedAt(value: Date | string) {
    this._updatedAt = RootEntity.normalizeDate(value);
  }

  /**
   * Returns the expected persistence version baseline (`_persistedVersion`).
   *
   * This baseline represents the last confirmed durable version successfully written
   * to persistent storage. Persistence adapters use this value in version predicates
   * (e.g. `WHERE id = ? AND version = expectedVersion`) to detect concurrent updates.
   *
   * @returns The positive integer version expected in persistent storage.
   *
   * @example
   * ```typescript
   * const expected = user.getExpectedVersion(); // e.g. 1
   * await em.nativeUpdate(User, { id: user.id, version: expected }, { ...data, version: user.version });
   * ```
   */
  getExpectedVersion(): number {
    return this._persistedVersion;
  }

  /**
   * Acknowledges that a version has been successfully persisted to durable storage.
   * Advances the expected version baseline (`_persistedVersion`) to match the version
   * actually written (by default `this._version`), without recording a domain event
   * or advancing the in-memory version.
   *
   * This method is owned by persistence repositories and is typically invoked
   * automatically by the `@AcknowledgePersisted` method decorator upon successful
   * write resolution. Application code must never call this method directly; state
   * mutations belong in domain methods.
   *
   * @param version Optional specific version that was persisted. If omitted,
   *                `this._version` is used. Must be a positive integer (> 0).
   * @throws {Error} If `version` is provided but is not a positive integer.
   *
   * @example Manual invocation in a custom persistence repository
   * ```typescript
   * async save(user: User): Promise<UserSnapshot> {
   *   const snapshot = user.toJSON();
   *   await this.db.update(user.id, snapshot);
   *   user.acknowledgePersisted(); // advances _persistedVersion to user.version
   *   return snapshot;
   * }
   * ```
   *
   * @example Declarative invocation via `@AcknowledgePersisted` (recommended)
   * ```typescript
   * @AcknowledgePersisted<[User]>({ entity: ([user]) => user })
   * async save(user: User): Promise<UserSnapshot> {
   *   // Decorator captures user.version before execution and calls
   *   // user.acknowledgePersisted() when the returned promise resolves.
   *   return snapshot;
   * }
   * ```
   */
  acknowledgePersisted(version?: number): void {
    if (typeof version === 'number') {
      if (!Number.isInteger(version) || version <= 0) {
        throw new Error('Persisted version must be a positive integer.');
      }
      this._persistedVersion = version;
      if (this._version < version) {
        this._version = version;
      }
      return;
    }
    this._persistedVersion = this._version;
  }

  /**
   * Applies a patch to fields registered with `@Mutable()`, ignoring undefined values.
   * Validates all keys and normalizes all values before writing any field.
   * Does not advance version/timestamps or record events; use inside a decorated mutation.
   *
   * @param patch - Public field names and proposed values; keys must be registered with `@Mutable()`.
   * @throws {UnknownMutableFieldError} When a defined patch key is not registered.
   * @throws Propagates field normalization errors without applying the patch.
   *
   * @example Inside a User aggregate with a mutable username field
   * ```ts
   * @ApplyMutation<User>({ event: (user) => new UserUpdatedEvent(user) })
   * update(username: string): this {
   *   this.applyPatch<User>({ username });
   *   return this;
   * }
   * ```
   */
  protected applyPatch<TEntity extends object>(
    patch: MutationPatch<TEntity>,
  ): void {
    if (patch === undefined || patch === null) {
      return;
    }
    if (typeof patch !== 'object') {
      throw new TypeError(
        'applyPatch() requires a field patch object, or nothing.',
      );
    }

    const fields = getMutableFields(this);
    const writes: Array<{
      propertyKey: string;
      value: unknown;
    }> = [];

    // Phase 1: validate all keys and normalize values before any state changes
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        continue;
      }
      const field = fields.get(key);
      if (!field) {
        throw new UnknownMutableFieldError(this.constructor.name, key, [
          ...fields.keys(),
        ]);
      }
      const normalizedValue = field.normalize ? field.normalize(value) : value;
      writes.push({
        propertyKey: field.propertyKey,
        value: normalizedValue,
      });
    }

    // Phase 2: apply normalized writes to backing properties
    for (const { propertyKey, value } of writes) {
      (this as unknown as Record<string, unknown>)[propertyKey] = value;
    }
  }

  protected onUpdate(): void {
    this._version += 1;
    this._updatedAt = new Date();
    this.afterUpdate();
  }

  protected freezeState<S extends object>(state: S): Readonly<S> {
    return Object.freeze(state);
  }

  /**
   * Post-mutation lifecycle hook, invoked after the version and `updatedAt`
   * advance and before the mutation's event is recorded. The default does
   * nothing; override it only when the aggregate has post-mutation work.
   */
  protected afterUpdate(): void {}

  abstract toJSON(): RootEntitySnapshot & TSnapshot;
}
