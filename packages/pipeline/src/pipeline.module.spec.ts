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

import { Injectable } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  IPipelineBehavior,
  NextDelegate,
} from './interfaces/pipeline.behavior.interface';
import { IPipelineContext } from './interfaces/pipeline.context.interface';
import { PIPELINE_MODULE_OPTIONS } from './options/pipeline-module.options';
import { PipelineModule } from './pipeline.module';
import { PipelineBootstrapService } from './services/pipeline.bootstrap.service';

// ── Test behaviors ──────────────────────────────────────────

@Injectable()
class AlphaBehavior implements IPipelineBehavior {
  async handle(_ctx: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

@Injectable()
class BetaBehavior implements IPipelineBehavior {
  async handle(_ctx: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

// ── forRoot ─────────────────────────────────────────────────

describe('PipelineModule.forRoot', () => {
  it('returns a DynamicModule with defaults when called with no args', () => {
    const mod = PipelineModule.forRoot();
    expect(mod.module).toBe(PipelineModule);
    expect(mod.providers).toBeDefined();
    expect(mod.exports).toBeDefined();
  });

  it('accepts a plain array of behavior classes (backward-compat)', () => {
    const mod = PipelineModule.forRoot([AlphaBehavior, BetaBehavior]);

    // Both behaviors should be in providers
    expect(mod.providers).toContain(AlphaBehavior);
    expect(mod.providers).toContain(BetaBehavior);
    // And exported for consumer modules
    expect(mod.exports).toContain(AlphaBehavior);
    expect(mod.exports).toContain(BetaBehavior);
  });

  it('registers core providers (options, bootstrap service)', () => {
    const mod = PipelineModule.forRoot([AlphaBehavior]);

    const providerTokens = mod.providers?.map((p: any) =>
      typeof p === 'function' ? p : p.provide,
    );

    expect(providerTokens).toContain(PIPELINE_MODULE_OPTIONS);
    expect(providerTokens).toContain(PipelineBootstrapService);
  });

  it('accepts an options object with behaviors', () => {
    const mod = PipelineModule.forRoot({
      behaviors: [AlphaBehavior],
      correlationIdFactory: () => 'test-id',
    });

    expect(mod.providers).toContain(AlphaBehavior);

    const optionsProvider = (mod.providers as any[]).find(
      (p: any) => p.provide === PIPELINE_MODULE_OPTIONS,
    );
    expect(optionsProvider).toBeDefined();
    expect(optionsProvider.useValue.correlationIdFactory).toBeDefined();
  });

  it('registers global before/after behavior types', () => {
    const mod = PipelineModule.forRoot({
      behaviors: [AlphaBehavior],
      globalBehaviors: {
        before: [BetaBehavior],
      },
    });

    // BetaBehavior is referenced only in globalBehaviors, not in behaviors[]
    // It should be auto-registered as a provider
    expect(mod.providers).toContain(BetaBehavior);
    expect(mod.exports).toContain(BetaBehavior);
  });

  it('does not duplicate behavior types that appear in both behaviors and globalBehaviors', () => {
    const mod = PipelineModule.forRoot({
      behaviors: [AlphaBehavior],
      globalBehaviors: {
        before: [AlphaBehavior], // same class
      },
    });

    // AlphaBehavior should appear only once in providers
    const alphaCounts = (mod.providers as unknown[]).filter(
      (p: unknown) => p === AlphaBehavior,
    ).length;
    expect(alphaCounts).toBe(1);
  });

  it('extracts behavior types from global behavior tuples (before and after)', () => {
    const mod = PipelineModule.forRoot({
      globalBehaviors: {
        before: [[AlphaBehavior, { someOpt: true }]],
        after: [[BetaBehavior, { otherOpt: false }]],
      },
    });

    expect(mod.providers).toContain(AlphaBehavior);
    expect(mod.providers).toContain(BetaBehavior);
    expect(mod.exports).toContain(AlphaBehavior);
    expect(mod.exports).toContain(BetaBehavior);
  });

  it('registers behavior types from an array of GlobalBehaviorsOptions', () => {
    const mod = PipelineModule.forRoot({
      globalBehaviors: [
        { scope: 'commands', before: [AlphaBehavior] },
        { scope: 'queries', after: [BetaBehavior] },
      ],
    });

    expect(mod.providers).toContain(AlphaBehavior);
    expect(mod.providers).toContain(BetaBehavior);
    expect(mod.exports).toContain(AlphaBehavior);
    expect(mod.exports).toContain(BetaBehavior);
  });

  it('does not duplicate behaviors that appear in both behaviors[] and array globalBehaviors', () => {
    const mod = PipelineModule.forRoot({
      behaviors: [AlphaBehavior],
      globalBehaviors: [
        { scope: 'commands', before: [AlphaBehavior] },
        { scope: 'queries', after: [BetaBehavior] },
      ],
    });

    const alphaCounts = (mod.providers as unknown[]).filter(
      (p: unknown) => p === AlphaBehavior,
    ).length;
    expect(alphaCounts).toBe(1);
    expect(mod.providers).toContain(BetaBehavior);
  });

  it('handles an empty globalBehaviors array', () => {
    const mod = PipelineModule.forRoot({
      globalBehaviors: [],
    });

    expect(mod.module).toBe(PipelineModule);
    expect(mod.providers).toBeDefined();
  });
});

// ── forFeature ──────────────────────────────────────────────

describe('PipelineModule.forFeature', () => {
  it('registers and exports the provided behaviors', () => {
    const mod = PipelineModule.forFeature([AlphaBehavior, BetaBehavior]);

    expect(mod.module).toBe(PipelineModule);
    expect(mod.providers).toContain(AlphaBehavior);
    expect(mod.providers).toContain(BetaBehavior);
    expect(mod.exports).toContain(AlphaBehavior);
    expect(mod.exports).toContain(BetaBehavior);
  });

  it('returns an empty set when no behaviors are given', () => {
    const mod = PipelineModule.forFeature([]);
    expect(mod.providers).toEqual([]);
    expect(mod.exports).toEqual([]);
  });
});
