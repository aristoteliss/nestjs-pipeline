/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { JwtAuthenticator } from './jwt-authenticator.js';

describe('JwtAuthenticator dependency contract', () => {
  it('resolves without providers; verification needs no session store', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [JwtAuthenticator],
    }).compile();

    expect(moduleRef.get(JwtAuthenticator)).toBeInstanceOf(JwtAuthenticator);
    await moduleRef.close();
  });
});
