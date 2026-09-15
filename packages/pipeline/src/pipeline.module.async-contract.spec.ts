/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { LOGGING_BEHAVIOR_LOGGER } from './behaviors/logging.behavior';
import type {
  IPipelineBehavior,
  NextDelegate,
} from './interfaces/pipeline.behavior.interface';
import type { IPipelineContext } from './interfaces/pipeline.context.interface';
import type { PipelineModuleAsyncOptions } from './options/pipeline-module.options';
import { PipelineModule } from './pipeline.module';
import { PipelineBootstrapService } from './services/pipeline.bootstrap.service';

class TestBehavior implements IPipelineBehavior {
  handle(_context: IPipelineContext, next: NextDelegate): Promise<unknown> {
    return next();
  }
}

describe('PipelineModule async provider-graph contract', () => {
  it('keeps the legacy module shape when no new async settings are used', () => {
    const factory = () => ({ bootstrapLogLevel: 'none' as const });
    const module = PipelineModule.forRootAsync({
      imports: [],
      behaviors: [TestBehavior],
      extraProviders: [],
      useFactory: factory,
    });

    expect(module.module).toBe(PipelineModule);
    expect(module.global).toBe(true);
    expect(module.imports).toEqual([]);
    expect(module.providers).toEqual(
      expect.arrayContaining([TestBehavior, PipelineBootstrapService]),
    );
    expect(module.exports).toEqual(
      expect.arrayContaining([TestBehavior, PipelineBootstrapService]),
    );
    expect(module.providers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: LOGGING_BEHAVIOR_LOGGER }),
      ]),
    );
    expect(module.exports).not.toContain(LOGGING_BEHAVIOR_LOGGER);
  });

  it('registers and exports a statically declared logger provider', () => {
    const logger = { log() {}, error() {}, warn() {} };
    const module = PipelineModule.forRootAsync({
      behaviors: [TestBehavior],
      loggerProvider: {
        provide: LOGGING_BEHAVIOR_LOGGER,
        useValue: logger,
      },
      useFactory: () => ({ bootstrapLogLevel: 'none' }),
    });

    expect(module.providers).toContain(TestBehavior);
    expect(module.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: LOGGING_BEHAVIOR_LOGGER,
          useValue: logger,
        }),
      ]),
    );
    expect(module.exports).toContain(LOGGING_BEHAVIOR_LOGGER);
  });

  it('validates the async logger provider token just like forRoot', () => {
    expect(() =>
      PipelineModule.forRootAsync({
        loggerProvider: {
          // Runtime cast exercises the defensive check independently of TS.
          provide: Symbol('wrong'),
          useValue: {},
        } as never,
        useFactory: () => ({}),
      }),
    ).toThrow(/LOGGING_BEHAVIOR_LOGGER/);
  });

  it('keeps the historical async tuple behavior form accepted', () => {
    const options: PipelineModuleAsyncOptions = {
      behaviors: [[TestBehavior, { enabled: true }]],
      useFactory: () => ({
        correlationIdFactory: () => 'corr',
        tenantIdFactory: () => 'tenant',
      }),
    };

    const module = PipelineModule.forRootAsync(options);

    expect(module.providers).toContain(TestBehavior);
    expect(module.exports).toContain(TestBehavior);
  });

  it('keeps async factories compatible with PipelineModuleOptions', () => {
    const options: PipelineModuleAsyncOptions = {
      behaviors: [TestBehavior],
      useFactory: () => ({
        bootstrapLogLevel: 'none',
        // Retained for backward compatibility even though provider registration
        // belongs on the static forRootAsync field above.
        behaviors: [TestBehavior],
      }),
    };

    expect(() => PipelineModule.forRootAsync(options)).not.toThrow();
  });

  it('does not require any new async option for useClass/useExisting consumers', () => {
    class Factory {
      createPipelineOptions() {
        return { bootstrapLogLevel: 'none' as const };
      }
    }

    expect(() =>
      PipelineModule.forRootAsync({ useClass: Factory }),
    ).not.toThrow();
    expect(() =>
      PipelineModule.forRootAsync({ useExisting: Factory }),
    ).not.toThrow();
  });
});
