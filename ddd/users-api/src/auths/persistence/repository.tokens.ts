/* Copyright (C) 2026-present Aristotelis — see repository license. */

export const COMMAND_REPOSITORY = {
  createAuth: Symbol('createAuth'),
  deleteAuth: Symbol('deleteAuth'),
} as const;

export const QUERY_REPOSITORY = {
  getUserCapabilities: Symbol('getUserCapabilities'),
  findAuth: Symbol('findAuth'),
} as const;
