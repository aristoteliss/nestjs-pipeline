/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** A refresh-token hash a session rotated away from; kept until the session ends. */
export class ConsumedRefreshToken {
  tokenHash!: string;
  authId!: string;
  consumedAt!: number;
}
