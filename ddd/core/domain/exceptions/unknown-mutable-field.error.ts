/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Raised when an `@ApplyMutation()` method returns a patch key that the aggregate has
 * not declared with `@Mutable()`.
 *
 * This is a wiring defect, not a domain rule violation: the mutation names a
 * field the aggregate does not expose for mutation, so nothing is written, no
 * version is advanced and no event is recorded.
 */
export class UnknownMutableFieldError extends Error {
  readonly aggregate: string;
  readonly field: string;

  constructor(aggregate: string, field: string, known: readonly string[]) {
    super(
      `${aggregate} does not declare '${field}' as a mutable field. Declare it with @Mutable() or remove it from the mutation patch. Known mutable fields: ${
        known.length > 0 ? known.join(', ') : '(none)'
      }.`,
    );
    this.name = UnknownMutableFieldError.name;
    this.aggregate = aggregate;
    this.field = field;
  }
}
