import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionUser } from '@common/types/SessionUser';

export const sessionUserStore = new AsyncLocalStorage<
  SessionUser | undefined
>();

// export function runWithSessionUser<T>(
//   sessionUser: SessionUser | undefined,
//   callback: () => T,
// ): T {
//   return sessionUserStore.run(sessionUser, callback);
// }

export function getSessionUserFromStore(): SessionUser | undefined {
  return sessionUserStore.getStore();
}
