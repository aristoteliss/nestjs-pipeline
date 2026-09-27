/* Copyright (C) 2026-present Aristotelis — see repository license. */

export const COMMAND_REPOSITORY = {
  createAuth: Symbol('createAuth'),
  updateAuth: Symbol('updateAuth'),
} as const;

export const QUERY_REPOSITORY = {
  getUserPermissionRules: Symbol('getUserPermissionRules'),
} as const;
