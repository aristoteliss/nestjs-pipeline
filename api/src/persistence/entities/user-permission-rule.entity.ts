/* Copyright (C) 2026-present Aristotelis — see repository license. */

export type UserPermissionRuleSource = 'role' | 'additional' | 'denied';

export class UserPermissionRule {
  userId!: string;
  position!: number;
  source!: UserPermissionRuleSource;
  roleId!: string | null;
  capabilityId!: string;
  subject!: string;
  action!: string;
  conditions!: string | null;
  fields!: string | null;
  inverted!: boolean;
  reason!: string | null;
}
