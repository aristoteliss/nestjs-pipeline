/* Copyright (C) 2026-present Aristotelis — see repository license. */

export const WELCOME_EMAIL_DISPATCHER = Symbol('WELCOME_EMAIL_DISPATCHER');
export const USER_BATCH_DISPATCHER = Symbol('USER_BATCH_DISPATCHER');

export type WelcomeEmailDispatch = {
  userId: string;
  username: string;
  email: string;
};

export type UserBatchDispatchItem = {
  userId: string;
  username?: string;
  email?: string;
};

/**
 * Application port for scheduling the welcome-email side effect. The job runs in
 * the tenant, correlation id and principal of the caller.
 */
export interface IWelcomeEmailDispatcher {
  enqueueWelcomeEmail(message: WelcomeEmailDispatch): Promise<void>;
}

/**
 * Application port for scheduling user batch work. The job runs in the tenant,
 * correlation id and principal of the caller.
 */
export interface IUserBatchDispatcher {
  enqueueUserBatch(items: readonly UserBatchDispatchItem[]): Promise<void>;
}
