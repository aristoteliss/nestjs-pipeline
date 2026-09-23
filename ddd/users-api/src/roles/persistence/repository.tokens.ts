/* Copyright (C) 2026-present Aristotelis — see repository license. */

export const COMMAND_REPOSITORY = {
  createRole: Symbol('createRole'),
  updateRole: Symbol('updateRole'),
  deleteRole: Symbol('deleteRole'),
} as const;

export const QUERY_REPOSITORY = {
  getRole: Symbol('getRole'),
  getRoles: Symbol('getRoles'),
} as const;
