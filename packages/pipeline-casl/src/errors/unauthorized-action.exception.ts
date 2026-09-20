/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
    const idMsg =
      details.entityId !== undefined ? ` (id=${details.entityId})` : '';
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
