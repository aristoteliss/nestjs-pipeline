/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DynamicModule, Injectable } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { LOGGING_BEHAVIOR_LOGGER } from './behaviors/logging.behavior';
import {
  IPipelineBehavior,
  NextDelegate,
} from './interfaces/pipeline.behavior.interface';
import { IPipelineContext } from './interfaces/pipeline.context.interface';
import { PIPELINE_MODULE_OPTIONS } from './options/pipeline-module.options';
import { PipelineModule } from './pipeline.module';
import { PipelineBootstrapService } from './services/pipeline.bootstrap.service';

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

  it('registers and exports a logger provider bound to the logger token', () => {
    const provider = {
      provide: LOGGING_BEHAVIOR_LOGGER as typeof LOGGING_BEHAVIOR_LOGGER,
      useValue: { log() {}, error() {}, warn() {} },
    };
    const mod = PipelineModule.forRoot({ loggerProvider: provider });

    expect(mod.providers).toContain(provider);
    expect(mod.exports).toContain(LOGGING_BEHAVIOR_LOGGER);
  });

  it('rejects a logger provider bound to another token at runtime', () => {
    expect(() =>
      PipelineModule.forRoot({
        loggerProvider: {
          provide: Symbol('wrong'),
          useValue: { log() {} },
        },
      } as unknown as Parameters<typeof PipelineModule.forRoot>[0]),
    ).toThrow(/LOGGING_BEHAVIOR_LOGGER/);
  });
});

describe('PipelineModule.forFeature', () => {
  it('registers and exports the provided behaviors application-wide', () => {
    const mod = PipelineModule.forFeature([AlphaBehavior, BetaBehavior]);

    expect(mod.module).toBe(PipelineModule);
    expect(mod.global).toBe(true);
    expect(mod.providers).toContain(AlphaBehavior);
    expect(mod.providers).toContain(BetaBehavior);
    expect(mod.exports).toContain(AlphaBehavior);
    expect(mod.exports).toContain(BetaBehavior);
  });

  it('accepts object registration with dependency imports without root providers', () => {
    const dependencyModule = { module: class DependencyModule {} };
    const mod = PipelineModule.forFeature({
      imports: [dependencyModule],
      behaviors: [AlphaBehavior, BetaBehavior],
    });

    expect(mod.module).toBe(PipelineModule);
    expect(mod.global).toBe(true);
    expect(mod.imports).toEqual([dependencyModule]);
    expect(mod.providers).toEqual([AlphaBehavior, BetaBehavior]);
    expect(mod.exports).toEqual([AlphaBehavior, BetaBehavior]);
    expect(mod.providers).not.toContain(PipelineBootstrapService);
    expect(mod.exports).not.toContain(PIPELINE_MODULE_OPTIONS);
  });

  it('supports object registration without imports and with no behaviors', () => {
    const mod = PipelineModule.forFeature({ behaviors: [] });
    expect(mod.providers).toEqual([]);
    expect(mod.exports).toEqual([]);
    expect(mod.imports).toBeUndefined();
  });

  it('returns an empty set when no behaviors are given', () => {
    const mod = PipelineModule.forFeature([]);
    expect(mod.providers).toEqual([]);
    expect(mod.exports).toEqual([]);
  });
});

describe('PipelineModule.forRootAsync', () => {
  it('registers with useFactory and inject', () => {
    const mod = PipelineModule.forRootAsync({
      inject: ['CUSTOM_SERVICE'],
      behaviors: [AlphaBehavior],
      useFactory: (service: string) => ({
        tenantIdFactory: () => `${service}:tenant`,
      }),
    });

    expect(mod.module).toBe(PipelineModule);
    expect(mod.global).toBe(true);
    expect(mod.providers).toContain(AlphaBehavior);
    expect(mod.providers).toContain(PipelineBootstrapService);
    expect(mod.exports).toContain(AlphaBehavior);
    expect(mod.exports).toContain(PipelineBootstrapService);

    const optionsProvider = mod.providers?.find(
      (p: any) => p && p.provide === PIPELINE_MODULE_OPTIONS,
    ) as any;
    expect(optionsProvider).toBeDefined();
    expect(optionsProvider.inject).toEqual(['CUSTOM_SERVICE']);
  });

  it('registers with useClass', () => {
    class ConfigService {
      createPipelineOptions() {
        return { tenantIdFactory: () => 'class-tenant' };
      }
    }

    const mod = PipelineModule.forRootAsync({
      useClass: ConfigService,
    });

    expect(mod.module).toBe(PipelineModule);
    expect(mod.providers).toContain(PipelineBootstrapService);
    expect(mod.providers).toContainEqual({
      provide: ConfigService,
      useClass: ConfigService,
    });
  });

  describe('provider-graph fields returned from the factory', () => {
    function optionsFactoryOf(mod: DynamicModule) {
      const provider = mod.providers?.find(
        (p: any) => p && p.provide === PIPELINE_MODULE_OPTIONS,
      ) as any;
      return provider.useFactory as (...args: unknown[]) => Promise<unknown>;
    }

    it.each([
      ['behaviors', { behaviors: [AlphaBehavior] }],
      [
        'loggerProvider',
        {
          loggerProvider: {
            provide: LOGGING_BEHAVIOR_LOGGER,
            useValue: console,
          },
        },
      ],
    ])('rejects %s returned from useFactory', async (field, returned) => {
      const mod = PipelineModule.forRootAsync({
        useFactory: () => returned as never,
      });

      await expect(optionsFactoryOf(mod)()).rejects.toThrow(
        new RegExp(`returned ${field}, which Nest cannot register`),
      );
    });

    it('names both fields when a factory returns both', async () => {
      const mod = PipelineModule.forRootAsync({
        useFactory: () =>
          ({
            behaviors: [AlphaBehavior],
            loggerProvider: {
              provide: LOGGING_BEHAVIOR_LOGGER,
              useValue: console,
            },
          }) as never,
      });

      await expect(optionsFactoryOf(mod)()).rejects.toThrow(
        /returned behaviors and loggerProvider/,
      );
    });

    it('rejects them from a useClass options factory, naming the class', async () => {
      class ConfigService {
        createPipelineOptions() {
          return { behaviors: [AlphaBehavior] } as never;
        }
      }

      const mod = PipelineModule.forRootAsync({ useClass: ConfigService });

      await expect(optionsFactoryOf(mod)(new ConfigService())).rejects.toThrow(
        /ConfigService\.createPipelineOptions\(\) returned behaviors/,
      );
    });

    it('passes runtime options through untouched', async () => {
      const runtime = { tenantIdFactory: () => 'acme' };
      const mod = PipelineModule.forRootAsync({
        behaviors: [AlphaBehavior],
        useFactory: () => runtime,
      });

      await expect(optionsFactoryOf(mod)()).resolves.toBe(runtime);
    });

    it('handles empty async options without throwing and returns empty providers array', () => {
      const mod = PipelineModule.forRootAsync({} as any);
      expect(mod.providers).toBeDefined();
    });
  });

  describe('extraProviders export mapping', () => {
    it('exports tokens from both provider objects and direct constructor classes', () => {
      class DirectService {}
      const valueProvider = { provide: 'CUSTOM_TOKEN', useValue: 'val' };

      const mod = PipelineModule.forRootAsync({
        behaviors: [AlphaBehavior],
        extraProviders: [DirectService, valueProvider],
        useFactory: () => ({}),
      });

      expect(mod.exports).toContain(DirectService);
      expect(mod.exports).toContain('CUSTOM_TOKEN');
    });
  });
});

describe('PipelineModule behavior entry validation', () => {
  it('rejects undefined global behaviors before Nest builds the provider graph', () => {
    expect(() =>
      PipelineModule.forRoot({
        globalBehaviors: { before: [undefined as never] },
      }),
    ).toThrow(/PipelineModule.*entry 0/);
  });
  it('rejects malformed async provider entries', () => {
    expect(() =>
      PipelineModule.forRootAsync({
        behaviors: [[undefined, {}] as never],
        useFactory: () => ({}),
      }),
    ).toThrow(/PipelineModule.*entry 0/);
  });
});

it('rejects undefined feature behavior providers at registration', () => {
  expect(() => PipelineModule.forFeature([undefined as never])).toThrow(
    /forFeature.*entry 0/,
  );
});
