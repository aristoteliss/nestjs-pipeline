import { describe, it, expect } from 'vitest';
import { PipelineModule } from './pipeline.module';
import { IPipelineBehavior, NextDelegate } from './interfaces/pipeline.behavior.interface';
import { IPipelineContext } from './interfaces/pipeline.context.interface';
import { Injectable } from '@nestjs/common';
import { PIPELINE_MODULE_OPTIONS } from './options/pipeline-module.options';
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

    const providerTokens = mod.providers!.map((p: any) =>
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
        before: [AlphaBehavior],   // same class
      },
    });

    // AlphaBehavior should appear only once in providers
    const alphaCounts = (mod.providers as any[]).filter(
      (p: any) => p === AlphaBehavior,
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
