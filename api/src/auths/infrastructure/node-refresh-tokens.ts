/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { IRefreshTokens } from '../application/authentication.ports';

/** 32 random bytes as base64url; stored only as a SHA-256 hex digest. */
@Injectable()
export class NodeRefreshTokens implements IRefreshTokens {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
