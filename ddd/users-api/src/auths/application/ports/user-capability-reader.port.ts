/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

import type { UserCapabilities } from '@nestjs-pipeline/casl';

/**
 * Application-facing read port for capabilities required during authentication.
 * Token issuance depends on this narrow contract instead of dispatching a nested
 * CQRS query from inside a command flow.
 */
export interface IUserCapabilityReader {
  getCapabilities(userId: string): Promise<UserCapabilities>;
}

/** DI token for the authentication capability reader. */
export const USER_CAPABILITY_READER = Symbol('USER_CAPABILITY_READER');
