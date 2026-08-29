/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { ForbiddenException } from '@nestjs/common';
import { assertEntityPermission, getCaslAbility } from '@nestjs-pipeline/casl';
import type { Role, RoleSnapshot } from '../domain/models/role.entity';

function snapshotOf(role: Role | RoleSnapshot): RoleSnapshot {
  return 'toJSON' in role && typeof role.toJSON === 'function'
    ? role.toJSON()
    : role;
}

/** Enforce a permission against a constructed or loaded role instance. */
export function assertRolePermission(
  role: Role | RoleSnapshot,
  action: string,
  fields?: string[],
): void {
  const ability = getCaslAbility();
  if (!ability) return;

  assertEntityPermission(ability, {
    action,
    subject: 'Role',
    entity: { ...snapshotOf(role) },
    fields,
  });
}

/** Authorize and project a role into the mandatory public response fields. */
export function authorizeRoleRead(
  role: Role | RoleSnapshot,
  options: { omitUnauthorized?: boolean } = {},
): RoleSnapshot | null {
  try {
    assertRolePermission(role, 'read', ['id', 'name']);
  } catch (error) {
    if (options.omitUnauthorized && error instanceof ForbiddenException) {
      return null;
    }
    throw error;
  }

  const snapshot = snapshotOf(role);
  return { id: snapshot.id, name: snapshot.name };
}
