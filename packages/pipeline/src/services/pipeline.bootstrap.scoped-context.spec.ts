/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { IPipelineContext } from '../interfaces/pipeline.context.interface';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import { UsePipeline } from '../decorators/pipeline.decorator';
import {
  getAttachedCqrsContextId,
  PipelineBootstrapService,
} from './pipeline.bootstrap.service';
import { AsyncContext } from '@nestjs/cqrs';
import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import { describe, expect, it, vi } from 'vitest';

class ScopedBehavior implements IPipelineBehavior {
  async handle(_context: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

class TestCommand {}

@UsePipeline(ScopedBehavior)
class RequestScopedHandler {
  async execute(_command: TestCommand) {
    return 'ok';
  }
}

describe('PipelineBootstrapService scoped CQRS context', () => {
  it('returns undefined when CQRS does not expose AsyncContext (CQRS 10)', () => {
    expect(getAttachedCqrsContextId(new TestCommand(), {})).toBeUndefined();
  });

  it('uses AsyncContext.of when the installed CQRS version exposes it', () => {
    const id = { id: 42 };
    const of = vi.fn().mockReturnValue({ id });
    const command = new TestCommand();

    expect(
      getAttachedCqrsContextId(command, { AsyncContext: { of } }),
    ).toBe(id);
    expect(of).toHaveBeenCalledWith(command);
  });

  it('resolves dynamic behaviors with the same AsyncContext id as the scoped handler', async () => {
    const explorer = {
      explore: vi.fn().mockReturnValue({
        commands: [
          {
            instance: undefined,
            metatype: RequestScopedHandler,
            scope: 2,
          },
        ],
        queries: [],
        events: [],
      }),
    };
    const resolved = new ScopedBehavior();
    const resolve = vi.fn().mockResolvedValue(resolved);
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === ExplorerService) return explorer;
        if (token === ScopedBehavior) {
          throw new Error('request scoped');
        }
        throw new Error('unexpected token');
      }),
      resolve,
    };

    new PipelineBootstrapService(moduleRef as never).onApplicationBootstrap();

    const asyncContext = new AsyncContext();
    const command = new TestCommand();
    asyncContext.attachTo(command);

    await new RequestScopedHandler().execute(command);

    expect(resolve).toHaveBeenCalledWith(
      ScopedBehavior,
      asyncContext.id,
      { strict: false },
    );
  });
});
