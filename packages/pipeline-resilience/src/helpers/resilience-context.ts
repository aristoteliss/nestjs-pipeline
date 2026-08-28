/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { pipelineStore } from '@nestjs-pipeline/core';

/** Context item containing Cockatiel's abort signal for the active execution. */
export const RESILIENCE_ABORT_SIGNAL_ITEM = 'resilience.abortSignal';

/**
 * Returns the AbortSignal supplied by the active resilience policy, when called
 * inside a pipeline invocation wrapped by {@link ResilienceBehavior}.
 *
 * This is primarily useful with cooperative timeouts: pass the signal to APIs
 * that support cancellation (fetch, database clients, SDK calls, etc.) so the
 * work can stop when Cockatiel requests cancellation.
 */
export function getResilienceAbortSignal(): AbortSignal | undefined {
  return pipelineStore
    .getStore()
    ?.items.get(RESILIENCE_ABORT_SIGNAL_ITEM) as AbortSignal | undefined;
}
