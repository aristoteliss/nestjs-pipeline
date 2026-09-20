/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Registration options for a mutable aggregate field.
 *
 * @typeParam TValue - The value type stored in the backing property.
 */
export interface MutableOptions<TValue = unknown> {
  /**
   * Public patch key a domain method uses for this field. Defaults to the
   * decorated property name with a single leading underscore removed
   * (`_username` becomes `username`).
   */
  readonly as?: string;

  /**
   * Invariant check and coercion applied before the value reaches the backing
   * property. Throw a domain exception here to reject the mutation; the
   * aggregate is then left untouched, no version is advanced and no event is
   * recorded.
   */
  readonly normalize?: (value: TValue) => TValue;
}

/** A registered mutable field: its backing property and its normalizer. */
export interface MutableFieldDefinition {
  readonly propertyKey: string;
  readonly patchKey: string;
  readonly normalize?: (value: unknown) => unknown;
}

const MUTABLE_FIELDS = Symbol('MUTABLE_FIELDS');

type MutableCarrier = {
  [MUTABLE_FIELDS]?: Map<string, MutableFieldDefinition>;
};

/**
 * Declares an aggregate property as mutable through domain methods.
 *
 * `@ApplyMutation()` writes only to fields registered here, so the set of properties a
 * mutation may touch is declared once on the field itself instead of being
 * restated in every method that changes it.
 *
 * @param options - Patch key override and the field's normalizer.
 * @returns A property decorator registering the field on the owning class.
 *
 * @example
 * ```ts
 * export class User extends RootEntity<UserSnapshot> {
 *   @Mutable<string>({ normalize: (value) => User.normalizeUsername(value) })
 *   private _username: string;
 * }
 * ```
 */
export function Mutable<TValue = unknown>(
  options: MutableOptions<TValue> = {},
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    if (typeof propertyKey !== 'string') {
      throw new TypeError('@Mutable() supports string properties only.');
    }

    const owner = (target as { constructor: unknown }).constructor as
      | MutableCarrier
      | undefined;

    if (!owner) {
      throw new TypeError('@Mutable() supports instance properties only.');
    }

    const own = Object.hasOwn(owner, MUTABLE_FIELDS)
      ? (owner[MUTABLE_FIELDS] as Map<string, MutableFieldDefinition>)
      : new Map<string, MutableFieldDefinition>();
    owner[MUTABLE_FIELDS] = own;

    const patchKey = options.as ?? propertyKey.replace(/^_/, '');
    own.set(patchKey, {
      propertyKey,
      patchKey,
      normalize: options.normalize as ((value: unknown) => unknown) | undefined,
    });
  };
}

/**
 * Resolves every mutable field visible on an instance, including fields
 * declared by base classes.
 *
 * @param instance - The aggregate to inspect.
 * @returns Patch key to field definition, nearest declaration winning.
 */
export function getMutableFields(
  instance: object,
): ReadonlyMap<string, MutableFieldDefinition> {
  const resolved = new Map<string, MutableFieldDefinition>();
  const chain: MutableCarrier[] = [];

  let current: unknown = instance.constructor;
  while (typeof current === 'function') {
    chain.push(current as MutableCarrier);
    current = Object.getPrototypeOf(current);
  }

  for (const owner of chain.reverse()) {
    if (!Object.hasOwn(owner, MUTABLE_FIELDS)) {
      continue;
    }
    const fields = owner[MUTABLE_FIELDS];
    if (!fields) {
      continue;
    }
    for (const [patchKey, definition] of fields) {
      resolved.set(patchKey, definition);
    }
  }

  return resolved;
}
