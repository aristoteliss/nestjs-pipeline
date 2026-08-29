/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { subject as caslSubject } from '@casl/ability';
import { ForbiddenException } from '@nestjs/common';
import {
  assertEntityPermission,
  type EntityPermissionCheck,
  getCaslAbility,
} from '@nestjs-pipeline/casl';
import type { User, UserSnapshot } from '../../domain/models/user.entity';

const REQUIRED_RESPONSE_FIELDS = ['id', 'email', 'username'] as const;

function snapshotOf(user: User | UserSnapshot): UserSnapshot {
  return 'toJSON' in user && typeof user.toJSON === 'function'
    ? user.toJSON()
    : user;
}

/** Enforce a mutation permission against the constructed or loaded user. */
export function assertUserPermission(
  user: User | UserSnapshot,
  action: string,
  fields?: string[],
): void {
  const ability = getCaslAbility();
  if (!ability) return;

  const snapshot = snapshotOf(user);
  assertEntityPermission(ability, {
    action,
    subject: 'User',
    entity: { ...snapshot },
    fields,
  } satisfies EntityPermissionCheck);
}

/**
 * Authorizes a loaded user rather than the query-shaped pseudo subject used by
 * the pre-handler check, then removes response fields the ability cannot read.
 */
export function authorizeUserRead(
  user: User | UserSnapshot,
  options: { omitUnauthorized?: boolean } = {},
): UserSnapshot | null {
  const snapshot = snapshotOf(user);
  const ability = getCaslAbility();
  if (!ability) return snapshot;

  const subject = caslSubject('User', {
    ...snapshot,
  }) as unknown as string;

  if (!ability.can('read', subject)) {
    if (options.omitUnauthorized) return null;
    throw new ForbiddenException('Access denied — insufficient permissions.');
  }

  // The public response schema requires these fields. Treat an ability that
  // cannot read all of them as unauthorized instead of returning a partial
  // object that fails response mapping with an unrelated HTTP 500.
  if (
    REQUIRED_RESPONSE_FIELDS.some(
      (field) => !ability.can('read', subject, field),
    )
  ) {
    if (options.omitUnauthorized) return null;
    throw new ForbiddenException('Access denied — insufficient permissions.');
  }

  return {
    id: snapshot.id,
    email: snapshot.email,
    username: snapshot.username,
    ...(ability.can('read', subject, 'department')
      ? { department: snapshot.department }
      : {}),
  };
}
