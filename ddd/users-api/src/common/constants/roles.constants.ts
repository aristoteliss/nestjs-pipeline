/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
