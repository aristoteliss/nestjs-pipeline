/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

/**
 * A client operation identity: retries of one operation send the same value,
 * a new operation sends a new one.
 */
export const IdempotencyKeySchema = z.string().trim().min(1).max(255);
