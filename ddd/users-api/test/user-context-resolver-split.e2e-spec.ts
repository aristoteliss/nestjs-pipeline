import { CASL_USER_CONTEXT_RESOLVER } from '@nestjs-pipeline/casl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CaslUserContextResolver } from '../src/users/persistence/casl-user-context.resolver';
import { GetUserContextQueryRepository } from '../src/users/persistence/get-user-context.query-repository';
import { QUERY_REPOSITORY } from '../src/users/persistence/repository.tokens';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

describe('user context resolver/repository composition (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('registers distinct CASL resolver and query repository responsibilities', () => {
    const resolver = ctx.app.get<CaslUserContextResolver>(
      CASL_USER_CONTEXT_RESOLVER,
      { strict: false },
    );
    const repository = ctx.app.get<GetUserContextQueryRepository>(
      QUERY_REPOSITORY.getUserContext,
      { strict: false },
    );

    expect(resolver).toBeDefined();
    expect(repository).toBeDefined();
    expect(resolver).not.toBe(repository);
    expect(typeof resolver.resolve).toBe('function');
    expect(typeof repository.find).toBe('function');
    expect('resolve' in repository).toBe(false);
  });
});
