/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Action identifiers recorded in audit logs.
 */
export const AUDIT_ACTIONS = {
  /** User entity deletion action. */
  USER_DELETE: 'user.delete',
  /** Role entity deletion action. */
  ROLE_DELETE: 'role.delete',
  /** User login credential verification action. */
  AUTH_LOGIN: 'auth.login',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
