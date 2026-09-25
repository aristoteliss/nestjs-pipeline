/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability } from '@nestjs-pipeline/casl';

/** Maps a stored capability row (JSON conditions, comma-separated fields) to a rule. */
export function capabilityFromRow(row: {
  subject: string;
  action: string;
  conditions?: string | null;
  fields?: string | null;
  inverted: boolean;
  reason?: string | null;
}): Capability {
  return {
    subject: row.subject,
    action: row.action,
    conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
    inverted: row.inverted,
    reason: row.reason || undefined,
    fields: row.fields ? row.fields.split(',') : undefined,
  };
}
