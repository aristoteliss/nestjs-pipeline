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
 * System-defined role names initialized by database seed migrations.
 */
export const SYSTEM_ROLES = {
  /** Full administrative access role. */
  ADMIN: 'admin',
  /** Department-scoped user management role. */
  USER_MANAGER: 'user-manager',
  /** Self-scoped profile read and username-only update role. */
  SELF: 'self',
  /** Read-only viewer role. */
  VIEWER: 'viewer',
  /** Support agent role with department-scoped permissions. */
  SUPPORT_AGENT: 'support-agent',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];
