/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * A refresh-token hash a session rotated away from, part of the `Auth`
 * aggregate. It is kept until the session ends, so presenting that token again
 * is detected as reuse.
 */
export class ConsumedRefreshToken {
  constructor(
    readonly tokenHash: string,
    readonly authId: string,
    readonly consumedAt: number,
  ) {}
}
