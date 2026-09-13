/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

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

  it('registers distinct CASL resolver and query repository responsibilities', async () => {
    const resolver = await ctx.app.resolve<CaslUserContextResolver>(
      CASL_USER_CONTEXT_RESOLVER,
      undefined,
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
