/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { Test } from '@nestjs/testing';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { describe, expect, it } from 'vitest';
import { TENANT_CONTEXT } from '../../common/context/tenant-context.port';
import { JwtAuthenticator } from './jwt-authenticator';

describe('JwtAuthenticator dependency contract', () => {
  it('resolves with the tenant context alone; verification needs no session store', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: TENANT_CONTEXT, useClass: TenantSchemaContext },
        JwtAuthenticator,
      ],
    }).compile();

    expect(moduleRef.get(JwtAuthenticator)).toBeInstanceOf(JwtAuthenticator);
    await moduleRef.close();
  });
});
