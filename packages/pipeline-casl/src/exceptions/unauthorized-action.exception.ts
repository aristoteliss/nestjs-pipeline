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

export interface UnauthorizedActionDetails {
  action: string;
  subject: string;
  entityId?: string | number;
  fields?: string[];
  reason?: string;
}

/**
 * Exception thrown when an actor attempts an action or field modification
 * on a subject or entity without the required authorization permissions.
 */
export class UnauthorizedActionException extends Error {
  readonly action: string;
  readonly subject: string;
  readonly entityId?: string | number;
  readonly fields?: string[];

  constructor(details: UnauthorizedActionDetails) {
    const fieldMsg = details.fields?.length
      ? ` on fields: [${details.fields.join(', ')}]`
      : '';
    const idMsg = details.entityId ? ` (id=${details.entityId})` : '';
    const msg =
      details.reason ??
      `Access denied: cannot execute "${details.action}" on "${details.subject}"${idMsg}${fieldMsg}.`;

    super(msg);
    this.name = 'UnauthorizedActionException';
    this.action = details.action;
    this.subject = details.subject;
    this.entityId = details.entityId;
    this.fields = details.fields;
  }
}
