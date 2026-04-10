import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionUser } from '@common/types/SessionUser';

export const sessionUserStore = new AsyncLocalStorage<
  SessionUser | undefined
>();

export function getSessionUserFromStore(): SessionUser | undefined {
  return sessionUserStore.getStore();
}
