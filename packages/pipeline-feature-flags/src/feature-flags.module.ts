/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  type Client,
  NOOP_PROVIDER,
  OpenFeature,
} from '@openfeature/server-sdk';
import {
  FEATURE_FLAGS_CLIENT,
  FEATURE_FLAGS_DEFAULT_CONTEXT,
  FEATURE_FLAGS_DEFAULT_OPTIONS,
  FEATURE_FLAGS_TARGETING_KEY_FACTORY,
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
 * touching handler code. If neither a `client` nor `provider` is supplied,
 * the module uses OpenFeature's ambient client.
 *
 * For percentage rollouts, provide a stable {@link FeatureFlagsModuleOptions.targetingKeyFactory}
 * such as user/account/device ID. Correlation ID is intentionally not used as
 * the rollout identity because it normally changes on every request.
 *
 * @example Unleash provider, per-handler gating
 * ```ts
 * import { FeatureFlagsModule, FeatureFlagBehavior } from '@nestjs-pipeline/feature-flags';
 * import { UnleashProvider } from '@openfeature/unleash-provider';
 *
 * @Module({
 *   imports: [
 *     FeatureFlagsModule.forRoot({
 *       provider: new UnleashProvider({
 *         url: 'https://unleash.example.com/api',
 *         appName: 'my-app',
 *         token: process.env.UNLEASH_TOKEN!,
 *       }),
 *       context: { environment: process.env.NODE_ENV ?? 'development' },
 *       targetingKeyFactory: (ctx) =>
 *         ctx.items.get('userId') as string | undefined,
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
 * @example Sticky rollout scoped to an account instead of an individual user
 * ```ts
 * FeatureFlagsModule.forRoot({
 *   provider: myProvider,
 *   targetingKeyFactory: (ctx) =>
 *     ctx.items.get('accountId') as string | undefined,
 * });
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
export class FeatureFlagsModule {
  /**
   * Registers the feature-flag behavior, resolves the OpenFeature client
   * (registering the provider when supplied), and binds optional
   * application-wide defaults, targeting context, and stable targeting-key
   * resolver.
   *
   * @param options - Provider/client, targeting context, rollout identity, and default options.
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
        {
          provide: FEATURE_FLAGS_TARGETING_KEY_FACTORY,
          useValue: options.targetingKeyFactory,
        },
        {
          provide: RegisteredProviderLifecycle,
          useFactory: () => new RegisteredProviderLifecycle(options),
        },
      ],
      exports: [
        FeatureFlagBehavior,
        FEATURE_FLAGS_CLIENT,
        FEATURE_FLAGS_DEFAULT_OPTIONS,
        FEATURE_FLAGS_DEFAULT_CONTEXT,
        FEATURE_FLAGS_TARGETING_KEY_FACTORY,
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

/**
 * Unregisters, on application shutdown, a provider this module registered, so
 * polling or streaming providers stop with the application. Replacing it with
 * the no-op provider makes OpenFeature close it unless another domain still
 * uses it. A provider that another registration has since replaced, and a
 * consumer-supplied `client`, are left alone.
 */
class RegisteredProviderLifecycle implements OnApplicationShutdown {
  constructor(private readonly options: FeatureFlagsModuleOptions) {}

  async onApplicationShutdown(): Promise<void> {
    const { client, provider, domain } = this.options;
    if (client || !provider) return;

    const current = domain
      ? OpenFeature.getProvider(domain)
      : OpenFeature.getProvider();
    if (current !== provider) return;

    await (domain
      ? OpenFeature.setProviderAndWait(domain, NOOP_PROVIDER)
      : OpenFeature.setProviderAndWait(NOOP_PROVIDER));
  }
}
