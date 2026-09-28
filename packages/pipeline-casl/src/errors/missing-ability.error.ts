/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Raised when code that needs the caller's authorization runs without an
 * ability: `CaslBehavior` did not run for the request, or the code runs outside
 * a pipeline. A configuration failure, not a denial — map it to a server error,
 * never to 403.
 */
export class MissingAbilityError extends Error {
  /**
   * @param purpose - What needed the ability, named in the message.
   */
  constructor(readonly purpose: string) {
    super(`No authorization ability is present for ${purpose}.`);
    this.name = MissingAbilityError.name;
  }
}
