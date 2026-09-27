/* Copyright (C) 2026-present Aristotelis — see repository license. */

export interface RootEntitySnapshot {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version?: number;
}
