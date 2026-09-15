/* Copyright (C) 2026-present Aristotelis — see repository license. */

export const COMMAND_REPOSITORY = {
  createUser: Symbol('createUser'),
  updateUser: Symbol('updateUser'),
  deleteUser: Symbol('deleteUser'),
} as const;

export const EXT_USER_QUERY_REPOSITORY = {
  getUser: Symbol('getUser'),
};

export const QUERY_REPOSITORY = {
  ...EXT_USER_QUERY_REPOSITORY,
  getUsers: Symbol('getUsers'),
  getUserContext: Symbol('getUserContext'),
  getUserCapabilities: Symbol('getUserCapabilities'),
} as const;
