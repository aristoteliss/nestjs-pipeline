import { Test } from '@nestjs/testing';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { describe, expect, it } from 'vitest';
import { QUERY_REPOSITORY } from '../persistence/repository.tokens';
import { JwtAuthenticator } from './jwt-authenticator';

describe('JwtAuthenticator dependency contract', () => {
  it('fails module compilation when the durable Auth lookup repository is missing', async () => {
    await expect(
      Test.createTestingModule({
        providers: [TenantSchemaContext, JwtAuthenticator],
      }).compile(),
    ).rejects.toThrow();
  });

  it('resolves when the durable Auth lookup repository is registered', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantSchemaContext,
        { provide: QUERY_REPOSITORY.findAuth, useValue: { find: async () => null } },
        JwtAuthenticator,
      ],
    }).compile();

    expect(moduleRef.get(JwtAuthenticator)).toBeInstanceOf(JwtAuthenticator);
    await moduleRef.close();
  });
});
