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

import { RootEntity, type RootEntitySnapshot } from '@nestjs-pipeline/ddd-core';

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

  static create(
    action: string,
    subject: string,
    conditions?: string | null,
    inverted = false,
    reason?: string | null,
    fields?: string | null,
  ): Capability {
    return new Capability({
      action,
      subject,
      conditions,
      inverted,
      reason,
      fields,
    });
  }

  static fromJSON(snapshot: CapabilitySnapshot): Capability {
    return new Capability({
      id: Capability.normalizeId(snapshot.id),
      action: snapshot.action,
      subject: snapshot.subject,
      conditions: snapshot.conditions,
      inverted: snapshot.inverted,
      reason: snapshot.reason,
      fields: snapshot.fields,
      createdAt: Capability.normalizeDate(snapshot.createdAt),
      updatedAt: Capability.normalizeDate(snapshot.updatedAt),
    });
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

  afterUpdate(): void {}
}
