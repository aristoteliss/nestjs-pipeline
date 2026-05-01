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

import { RootEntity, RootEntitySnapshot } from '@nestjs-pipeline/ddd-core';
import { CreatedAuthEvent } from '../events/create-auth.event';
import { AuthCreateOutcome } from '../outcomes/auth-create.outcome';

export interface AuthSnapshot extends Partial<RootEntitySnapshot> {
  readonly userId: string;
  readonly tenantId?: string;
  readonly token: string;
}

export class Auth extends RootEntity<AuthSnapshot> {
  readonly prefixKey = 'auth:';

  readonly userId: string;
  readonly tenantId?: string;
  readonly token: string;

  private constructor(snapshot: AuthSnapshot) {
    super(snapshot);
    this.userId = snapshot.userId;
    this.tenantId = snapshot.tenantId;
    this.token = snapshot.token;
  }

  get cacheKey(): string {
    return `${this.prefixKey}${this.id}`;
  }

  static create(
    userId: string,
    tenantId: string | undefined,
    token: string,
  ): AuthCreateOutcome {
    const auth = new Auth({ userId, tenantId, token });
    return new AuthCreateOutcome(auth, [new CreatedAuthEvent(auth)]);
  }

  static fromJSON(snapshot: AuthSnapshot): Auth {
    return new Auth({
      id: Auth.normalizeId(snapshot.id),
      userId: snapshot.userId,
      tenantId: snapshot.tenantId,
      token: snapshot.token,
      createdAt: Auth.normalizeDate(snapshot.createdAt),
      updatedAt: Auth.normalizeDate(snapshot.updatedAt),
    });
  }

  toJSON(): RootEntitySnapshot & AuthSnapshot {
    return this.freezeState({
      id: this.id,
      userId: this.userId,
      tenantId: this.tenantId,
      token: this.token,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  afterUpdate(): void { }
}

