/* Copyright (C) 2026-present Aristotelis — see repository license. */

export const WELCOME_EMAIL_DISPATCHER = Symbol('WELCOME_EMAIL_DISPATCHER');
export const USER_BATCH_DISPATCHER = Symbol('USER_BATCH_DISPATCHER');

export interface WelcomeEmailDispatch {
  userId: string;
  username: string;
  email: string;
  tenant?: string;
  correlationId: string;
}

export interface UserBatchDispatchItem {
  userId: string;
  username?: string;
  email?: string;
  tenant?: string;
}

/** Application port for scheduling the welcome-email side effect. */
export interface IWelcomeEmailDispatcher {
  enqueueWelcomeEmail(message: WelcomeEmailDispatch): Promise<void>;
}

/** Application port for scheduling user batch work. */
export interface IUserBatchDispatcher {
  enqueueUserBatch(
    items: readonly UserBatchDispatchItem[],
    correlationId: string,
  ): Promise<void>;
}
