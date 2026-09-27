/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionPrincipal } from '@common/types/SessionPrincipal';

export const sessionPrincipalStore = new AsyncLocalStorage<
  SessionPrincipal | undefined
>();

export function getSessionPrincipal(): SessionPrincipal | undefined {
  return sessionPrincipalStore.getStore();
}
