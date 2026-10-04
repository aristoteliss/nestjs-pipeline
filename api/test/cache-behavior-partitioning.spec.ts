/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Integration coverage for `CacheBehavior` inside a real pipeline. These tests
 * assert the two properties a mocked store cannot show: a repeated request by
 * the same principal is served from the store, and a different principal's is
 * not.
 */

import { contextSources } from '@common/context/context-sources.js';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  UsePipeline,
} from '@cqrs-ddd/pipeline';
import {
  buildCache,
  CacheBehavior,
  createPartitionedCacheKeyFactory,
  MissingCachePartitionError,
} from '@cqrs-ddd/pipeline-cache';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { type INestApplication, Injectable } from '@nestjs/common';
import {
  CqrsModule,
  type IQueryHandler,
  QueryBus,
  QueryHandler,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PipelineModule } from '../src/common/pipeline/pipeline.module.js';

/** Stands in for whatever an authentication behavior resolves per request. */
let currentPrincipal: string | undefined = 'alice';
let currentTenant: string | undefined = 'tenant-a';

/** Copies the ambient principal onto the pipeline context, as a real auth behavior would. */
@Injectable()
class PrincipalBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    context.items.set('principal', currentPrincipal);
    return next();
  }
}

class GetReportQuery {
  constructor(readonly reportId: string) {}
}

const partitionedKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => ctx.items.get('principal') as string | undefined,
  requireScope: false,
});

@QueryHandler(GetReportQuery)
@UsePipeline(PrincipalBehavior, [CacheBehavior, { key: partitionedKey }])
class GetReportHandler implements IQueryHandler<GetReportQuery, unknown> {
  static executions = 0;

  async execute(query: GetReportQuery) {
    GetReportHandler.executions += 1;
    return { reportId: query.reportId, visibleTo: currentPrincipal };
  }
}

describe('CacheBehavior partitioning in a real pipeline', () => {
  let app: INestApplication;
  let queries: QueryBus;

  beforeEach(async () => {
    currentPrincipal = 'alice';
    currentTenant = 'tenant-a';
    GetReportHandler.executions = 0;

    // The module is composed per test on purpose, so each test gets a new cache
    // store; one shared store would turn the first lookup of each later test
    // into a hit.
    const moduleRef = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        PipelineModule.forRoot({ sources: contextSources }),
      ],
      providers: [
        GetReportHandler,
        PrincipalBehavior,
        {
          provide: CacheBehavior,
          useValue: new CacheBehavior(
            buildCache({ store: { type: 'memory' }, ttl: 60_000 }),
          ),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    const bus = app.get(QueryBus);
    queries = {
      execute: (query: Parameters<QueryBus['execute']>[0]) =>
        runWithTenant(currentTenant, () => bus.execute(query)),
    } as QueryBus;
  });

  afterEach(async () => {
    await app?.close();
  });

  it('serves a repeated request by the same principal from the store', async () => {
    const first = await queries.execute(new GetReportQuery('r-1'));
    const second = await queries.execute(new GetReportQuery('r-1'));

    expect(first).toEqual({ reportId: 'r-1', visibleTo: 'alice' });
    expect(second).toEqual(first);
    expect(GetReportHandler.executions).toBe(1);
  });

  it('does not serve one principal the response computed for another', async () => {
    const asAlice = await queries.execute(new GetReportQuery('r-1'));

    currentPrincipal = 'bob';
    const asBob = await queries.execute(new GetReportQuery('r-1'));

    expect(asAlice).toEqual({ reportId: 'r-1', visibleTo: 'alice' });
    expect(asBob).toEqual({ reportId: 'r-1', visibleTo: 'bob' });
    expect(GetReportHandler.executions).toBe(2);
  });

  it('separates tenants that share a principal identifier', async () => {
    await queries.execute(new GetReportQuery('r-1'));

    currentTenant = 'tenant-b';
    await queries.execute(new GetReportQuery('r-1'));

    expect(GetReportHandler.executions).toBe(2);
  });

  it('separates distinct payloads for the same principal', async () => {
    await queries.execute(new GetReportQuery('r-1'));
    await queries.execute(new GetReportQuery('r-2'));

    expect(GetReportHandler.executions).toBe(2);
  });

  it('fails closed when the principal cannot be resolved', async () => {
    currentPrincipal = undefined;

    await expect(queries.execute(new GetReportQuery('r-1'))).rejects.toThrow(
      MissingCachePartitionError,
    );
    // A hit would have skipped the handler and the entity-level authorization it
    // performs, so refusing to build the key is the only safe outcome.
    expect(GetReportHandler.executions).toBe(0);
  });
});
