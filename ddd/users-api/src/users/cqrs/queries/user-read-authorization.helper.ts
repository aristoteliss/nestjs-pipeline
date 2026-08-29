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
import { getCaslAbility } from '@nestjs-pipeline/casl';
import type { User, UserSnapshot } from '../../domain/models/user.entity';

const RESPONSE_FIELDS = ['id', 'email', 'username', 'department'] as const;

/**
 * Authorizes a loaded user rather than the query-shaped pseudo subject used by
 * the pre-handler check, then removes response fields the ability cannot read.
 */
export function authorizeUserRead(
  user: User,
  options: { omitUnauthorized?: boolean } = {},
): UserSnapshot | null {
  const snapshot = user.toJSON();
  const ability = getCaslAbility();
  if (!ability) return snapshot;

  const subject = caslSubject('User', {
    ...snapshot,
  }) as unknown as string;

  if (!ability.can('read', subject)) {
    if (options.omitUnauthorized) return null;
    throw new ForbiddenException('Access denied — insufficient permissions.');
  }

  const projected: Record<string, unknown> = {};
  for (const field of RESPONSE_FIELDS) {
    if (ability.can('read', subject, field)) {
      projected[field] = snapshot[field];
    }
  }

  return projected as unknown as UserSnapshot;
}
