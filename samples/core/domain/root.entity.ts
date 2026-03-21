import { isUuidV7, uuidv7 } from '@nestjs-pipeline/core';

type Method = (...args: unknown[]) => unknown;

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

export interface RootEntitySnapshot {
  readonly id: string;
  readonly createdAt: Date;
  updatedAt: Date;
};

/**
 * Base entity for shared identity and lifecycle behavior.
 *
 * - Handles UUID v7 identity and root date invariants.
 * - Exposes immutable id, createdAt, and updatedAt getters.
 * - Exposes onUpdate/afterUpdate hooks for mutation tracking.
 * - Requires child entities to provide JSON serialization.
 */
export abstract class RootEntity<TSnapshot extends Partial<RootEntitySnapshot>>
  implements RootEntitySnapshot {
  private readonly _id: string;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  protected constructor(snapshot?: Partial<RootEntitySnapshot>) {
    const id = snapshot?.id;
    const createdAt = snapshot?.createdAt;
    const updatedAt = snapshot?.updatedAt;

    if (id !== undefined && createdAt !== undefined && updatedAt !== undefined) {
      this._id = RootEntity.normalizeId(id);
      this._createdAt = RootEntity.normalizeDate(createdAt, 'createdAt');
      this._updatedAt = RootEntity.normalizeDate(updatedAt, 'updatedAt');
      return;
    }

    if (id !== undefined || createdAt !== undefined || updatedAt !== undefined) {
      throw new Error(
        'id, createdAt, and updatedAt must be provided together when rehydrating an entity.',
      );
    }

    const now = new Date();
    this._id = uuidv7();
    this._createdAt = now;
    this._updatedAt = now;
  }

  get id(): string { return this._id; }
  get createdAt(): Date { return new Date(this._createdAt); }
  get updatedAt(): Date { return new Date(this._updatedAt); }

  protected onUpdate(): void {
    this._updatedAt = new Date();
    this.afterUpdate();
  }

  protected freezeState<S extends object>(state: S): Readonly<S> {
    return Object.freeze(state);
  }

  protected static normalizeId(id?: string): string {
    if (typeof id !== 'string' || !isUuidV7(id)) {
      throw new Error('id must be a valid UUID v7.');
    }
    return id;
  }

  protected static normalizeDate(value?: Date | string, fieldName = 'date'): Date {
    if (value === undefined || value === null) {
      throw new Error(`${fieldName} is empty.`);
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      throw new Error(`${fieldName} is empty.`);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() <= 1) {
      throw new Error(`${fieldName} must be a valid non-empty date.`);
    }
    return parsed;
  }

  abstract afterUpdate(): void;

  abstract toJSON(): RootEntitySnapshot & TSnapshot;
}
