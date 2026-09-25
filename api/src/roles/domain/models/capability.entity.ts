/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RootEntity, type RootEntitySnapshot } from '@cqrs-ddd/core/domain';

export interface CapabilitySnapshot extends Partial<RootEntitySnapshot> {
  readonly action: string;
  readonly subject: string;
  readonly conditions?: string | null;
  readonly inverted?: boolean;
  readonly reason?: string | null;
  readonly fields?: string | null;
}

export class Capability extends RootEntity<CapabilitySnapshot> {
  static readonly prefixKey = 'capability:';

  readonly action: string;
  readonly subject: string;
  readonly conditions?: string | null;
  readonly inverted: boolean;
  readonly reason?: string | null;
  readonly fields?: string | null;

  constructor(snapshot?: CapabilitySnapshot) {
    super(snapshot);
    if (!snapshot) {
      this.action = '';
      this.subject = '';
      this.conditions = null;
      this.inverted = false;
      this.reason = null;
      this.fields = null;
      return;
    }
    this.action = snapshot.action;
    this.subject = snapshot.subject;
    this.conditions = snapshot.conditions;
    this.inverted = snapshot.inverted ?? false;
    this.reason = snapshot.reason;
    this.fields = snapshot.fields;
  }

  toJSON(): RootEntitySnapshot & CapabilitySnapshot {
    return this.freezeState({
      id: this.id,
      action: this.action,
      subject: this.subject,
      conditions: this.conditions,
      inverted: this.inverted,
      reason: this.reason,
      fields: this.fields,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }
}
