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

import { type DynamicModule, Module } from '@nestjs/common';
import { type Client, OpenFeature } from '@openfeature/server-sdk';
import {
  FEATURE_FLAGS_CLIENT,
  FEATURE_FLAGS_DEFAULT_CONTEXT,
  FEATURE_FLAGS_DEFAULT_OPTIONS,
} from './constants/tokens';
import { FeatureFlagBehavior } from './feature-flag.behavior';
import type {
  FeatureFlagBehaviorOptions,
  FeatureFlagsModuleOptions,
} from './interfaces/feature-flags-options.interface';

/**
 * NestJS module that wires an OpenFeature {@link Client} into the
 * {@link FeatureFlagBehavior}, optionally registering a provider and binding
 * application-wide default options / targeting context.
 *
 * OpenFeature is the abstraction layer, so the actual flag source is a drop-in
 * swap — pass an Unleash provider today, a Flagsmith provider tomorrow, without
 * touching handler code.
 *
 * @example Unleash (default), per-handler gating
 * ```ts
 * import { FeatureFlagsModule, FeatureFlagBehavior } from '@nestjs-pipeline/feature-flags';
 * import { UnleashProvider } from '@openfeature/unleash-provider';
 *
 * @Module({
 *   imports: [
 *     FeatureFlagsModule.forRoot({
 *       provider: new UnleashProvider({
 *         url: 'https://unleash.example.com/api',
 *         appName: 'users-api',
 *         token: process.env.UNLEASH_TOKEN!,
 *       }),
 *       context: { environment: process.env.NODE_ENV ?? 'development' },
 *     }),
 *     PipelineModule.forRoot({ behaviors: [FeatureFlagBehavior] }),
 *   ],
 * })
 * export class AppModule {}
 *
 * @CommandHandler(NewCheckoutCommand)
 * @UsePipeline([FeatureFlagBehavior, { flag: 'new-checkout' }])
 * export class NewCheckoutHandler implements ICommandHandler<NewCheckoutCommand> {}
 * ```
 *
 * @example Flagsmith — drop-in replacement (only the provider changes)
 * ```ts
 * import { FlagsmithProvider } from '@openfeature/flagsmith-provider';
 *
 * FeatureFlagsModule.forRoot({
 *   provider: new FlagsmithProvider({ environmentKey: process.env.FLAGSMITH_KEY! }),
 * });
 * ```
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: static-only configuration class
export class FeatureFlagsModule {
  /**
   * Registers the feature-flag behavior, resolves the OpenFeature client
   * (registering the provider when supplied), and binds optional
   * application-wide defaults.
   *
   * @param options - Provider/client, targeting context, and default options.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(options: FeatureFlagsModuleOptions = {}): DynamicModule {
    const defaults: FeatureFlagBehaviorOptions = options.defaults ?? {};

    return {
      module: FeatureFlagsModule,
      global: true,
      providers: [
        FeatureFlagBehavior,
        {
          provide: FEATURE_FLAGS_CLIENT,
          useFactory: (): Promise<Client> => resolveClient(options),
        },
        {
          provide: FEATURE_FLAGS_DEFAULT_OPTIONS,
          useValue: defaults,
        },
        {
          provide: FEATURE_FLAGS_DEFAULT_CONTEXT,
          useValue: options.context,
        },
      ],
      exports: [
        FeatureFlagBehavior,
        FEATURE_FLAGS_CLIENT,
        FEATURE_FLAGS_DEFAULT_OPTIONS,
        FEATURE_FLAGS_DEFAULT_CONTEXT,
      ],
    };
  }
}

/**
 * Resolves the OpenFeature client: prefers an explicit `client`, otherwise
 * registers the given `provider` (awaiting readiness by default) and returns the
 * domain-scoped client. With neither, the ambient default client is returned.
 */
async function resolveClient(
  options: FeatureFlagsModuleOptions,
): Promise<Client> {
  if (options.client) return options.client;

  if (options.provider) {
    if (options.waitForReady === false) {
      options.domain
        ? OpenFeature.setProvider(options.domain, options.provider)
        : OpenFeature.setProvider(options.provider);
    } else {
      await (options.domain
        ? OpenFeature.setProviderAndWait(options.domain, options.provider)
        : OpenFeature.setProviderAndWait(options.provider));
    }
  }

  return options.domain
    ? OpenFeature.getClient(options.domain)
    : OpenFeature.getClient();
}
