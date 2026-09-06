/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

/**
 * Base class for all domain-layer exceptions.
 *
 * Decouples business invariant failures from web frameworks, HTTP status codes,
 * and transport boundaries, ensuring domain logic remains pure and executable
 * across HTTP APIs, background jobs, CLIs, and microservices.
 *
 * Domain exceptions carry domain-specific contextual properties (e.g. invalid
 * field values, threshold limits) rather than HTTP status codes. Presentation
 * boundaries (such as NestJS exception filters) translate them into appropriate
 * transport responses (e.g., HTTP 400, 409, 422).
 *
 * @example Defining a concrete domain exception
 * ```typescript
 * export class InvalidUsernameException extends DomainException {
 *   readonly minLength: number;
 *   readonly actualValue: string;
 *
 *   constructor(actualValue: string, minLength = 3) {
 *     super(`Username must be at least ${minLength} characters, received: "${actualValue}".`);
 *     this.minLength = minLength;
 *     this.actualValue = actualValue;
 *   }
 * }
 * ```
 */
export abstract class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
