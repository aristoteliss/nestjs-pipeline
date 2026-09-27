/* Copyright (C) 2026-present Aristotelis — see repository license. */

const NAME = '[A-Za-z_][A-Za-z0-9_]*';
const UNQUALIFIED = new RegExp(`^${NAME}$`);
const QUALIFIED = new RegExp(`^${NAME}(\\.${NAME})?$`);

/** Options for {@link isSqlIdentifier}. */
export interface SqlIdentifierOptions {
  /** Also accept one `schema.` qualifier, as in `app.cache`. Default `false`. */
  readonly qualified?: boolean;
}

/**
 * Whether `name` is an unquoted SQL identifier: a letter or underscore, then
 * letters, digits or underscores. Use it before interpolating a name into SQL
 * text, where it cannot be passed as a parameter.
 *
 * @example
 * ```ts
 * isSqlIdentifier('tenant_a');                       // true
 * isSqlIdentifier('tenant-a');                       // false
 * isSqlIdentifier('app.cache', { qualified: true }); // true
 * ```
 */
export function isSqlIdentifier(
  name: string,
  options: SqlIdentifierOptions = {},
): boolean {
  return (options.qualified ? QUALIFIED : UNQUALIFIED).test(name);
}
