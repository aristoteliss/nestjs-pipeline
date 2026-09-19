# @nestjs-pipeline/feature-flags

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/feature-flags.svg)](https://www.npmjs.com/package/@nestjs-pipeline/feature-flags)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/feature-flags.svg)](https://www.npmjs.com/package/@nestjs-pipeline/feature-flags)

Feature-flag **gating** behavior for `@nestjs-pipeline/core` — wrap any command, query, or event handler behind a boolean flag and short-circuit (or fall back) when it's off.

Provider-agnostic by design: it talks only to the **[OpenFeature](https://openfeature.dev)** API, so the backing source is a drop-in swap. **Unleash** is used in the examples below, and **Flagsmith** (or LaunchDarkly, a local file, …) is a one-line replacement — your handlers never change.

---

## Table of Contents

- [Why OpenFeature?](#why-openfeature)
- [Installation](#installation)
- [Setup](#setup)
  - [1. Register a provider (Unleash)](#1-register-a-provider-unleash)
  - [2. Gate a handler](#2-gate-a-handler)
- [Drop-in Replacement: Flagsmith](#drop-in-replacement-flagsmith)
- [Behavior](#behavior)
- [Configuration](#configuration)
  - [Options](#options)
  - [Module-wide Defaults](#module-wide-defaults)
  - [Targeting Context](#targeting-context)
  - [Graceful Fallback](#graceful-fallback)
  - [Mapping the Error to HTTP](#mapping-the-error-to-http)
- [Custom Logger](#custom-logger)
- [API Reference](#api-reference)
- [License](#license)

---

## Why OpenFeature?

[OpenFeature](https://openfeature.dev) is a CNCF, vendor-neutral **standard** for
feature-flag evaluation. This package builds on `@openfeature/server-sdk`, so:

- **Generic** — handlers depend on a flag *key*, never on a vendor SDK.
- **Swappable** — change the provider in one place (`forRoot`) to move between
  Unleash, Flagsmith, LaunchDarkly, GO Feature Flag, environment variables, etc.
- **Testable** — point it at an in-memory provider in tests.

---

## Installation

```bash
pnpm add @nestjs-pipeline/feature-flags @openfeature/server-sdk
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

Plus **one** OpenFeature provider for your backend, e.g. Unleash:

```bash
pnpm add @openfeature/unleash-provider
```

---

## Setup

### 1. Register a provider (Unleash)

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule } from '@nestjs-pipeline/core';
import { FeatureFlagsModule, FeatureFlagBehavior } from '@nestjs-pipeline/feature-flags';
import { UnleashProvider } from '@openfeature/unleash-provider';

@Module({
  imports: [
    CqrsModule.forRoot(),
    FeatureFlagsModule.forRoot({
      provider: new UnleashProvider({
        url: 'https://unleash.example.com/api',
        appName: 'my-app',
        token: process.env.UNLEASH_TOKEN!,
      }),
      // Static context merged into every evaluation:
      context: { environment: process.env.NODE_ENV ?? 'development' },
    }),
    PipelineModule.forRoot({ behaviors: [FeatureFlagBehavior] }),
  ],
})
export class AppModule {}
```

> The module awaits provider readiness (`setProviderAndWait`) during bootstrap by
> default, so the first request already sees correct flag values. Set
> `waitForReady: false` to register without blocking startup.

### 2. Gate a handler

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { featureFlag } from '@nestjs-pipeline/feature-flags';

@CommandHandler(NewCheckoutCommand)
@UsePipeline(featureFlag({ flag: 'new-checkout' }))
export class NewCheckoutHandler implements ICommandHandler<NewCheckoutCommand> {
  async execute(command: NewCheckoutCommand): Promise<Receipt> {
    // Only runs when the 'new-checkout' flag is enabled for this request.
    return this.checkout.run(command);
  }
}
```

> The raw tuple form `@UsePipeline([FeatureFlagBehavior, { flag: 'new-checkout' }])` remains supported as an escape hatch.

When `new-checkout` is **off**, the handler never executes — the behavior throws
`FeatureDisabledError` (or returns your `fallback`).

---

## Drop-in Replacement: Flagsmith

Switching providers is a **one-line** change in `forRoot` — no handler touches it:

```typescript
import { FlagsmithProvider } from '@openfeature/flagsmith-provider';

FeatureFlagsModule.forRoot({
  provider: new FlagsmithProvider({
    environmentKey: process.env.FLAGSMITH_KEY!,
  }),
});
```

The flag key (`'new-checkout'`) and every `@UsePipeline` decorator stay exactly
the same.

---

## Behavior

For each request, `FeatureFlagBehavior`:

1. Resolves effective options (module defaults ← per-handler options).
2. If **no `flag`** is configured → passes straight through (no-op).
3. Builds a targeting [context](#targeting-context) from the request.
4. Evaluates boolean details via OpenFeature. `errorPolicy: 'use-default'` uses
   `defaultValue` (default `false`); `'throw'` raises `FeatureFlagEvaluationError`.
   If `allowedVariants` is set, a true value also needs an allowed variant.
5. Records the value, flag key, and detailed decision under exported Symbol keys
   in `context.items`: `FEATURE_FLAG_ITEM`, `FEATURE_FLAG_KEY_ITEM`, and
   `FEATURE_FLAG_DECISION_ITEM`.
6. **Enabled** → runs the handler. **Disabled** → returns `fallback(context)` if
   set, otherwise throws `FeatureDisabledError`.

---

## Configuration

### Options

Per-handler options via `@UsePipeline([FeatureFlagBehavior, options])`:

| Option | Type | Default | Description |
|---|---|---|---|
| `flag` | `string` | — | Boolean flag key to gate on. Omit for a no-op. |
| `defaultValue` | `boolean` | `false` | Value used when evaluation fails / key is unknown. |
| `fallback` | `(ctx) => unknown \| Promise<unknown>` | — | Returned when disabled, instead of throwing. |
| `context` | `(ctx) => EvaluationContext` | — | Extra targeting context for this handler. |
| `targetingKeyFactory` | `(ctx) => string \| undefined` | — | Stable rollout identity; overrides the module resolver. |
| `allowedVariants` | `readonly string[]` | — | Require a true value and an allowed provider variant. |
| `errorPolicy` | `use-default` \| `throw` | `use-default` | Use the default value or raise `FeatureFlagEvaluationError` on provider errors. |

### Module-wide Defaults

Set defaults once; per-handler options are shallow-merged on top (handler wins):

```typescript
FeatureFlagsModule.forRoot({
  provider,
  defaults: { defaultValue: false },
});
```

### Targeting Context

Every evaluation receives a context, merged **later-wins**:

```
base(request) → module `context` → handler `context(request)` → targeting-key factory
```

The base context is derived from the pipeline request:

| Key | Value |
|---|---|
| `pipeline.correlation_id` | `context.correlationId` (tracing metadata, not rollout identity) |
| `pipeline.tenant_id` | `context.tenantId`, when present |
| `pipeline.request.kind` | `command` \| `query` \| `event` |
| `pipeline.request.name` | `NewCheckoutCommand` |
| `pipeline.handler.name` | `NewCheckoutHandler` |

```typescript
@UsePipeline([
  FeatureFlagBehavior,
  {
    flag: 'new-checkout',
    context: (ctx) => ({ targetingKey: ctx.request.userId, plan: 'pro' }),
  },
])
```

### Graceful Fallback

Return a safe value instead of throwing when a feature is off:

```typescript
@QueryHandler(GetRecommendationsQuery)
@UsePipeline([
  FeatureFlagBehavior,
  { flag: 'ml-recommendations', fallback: () => [] },
])
export class GetRecommendationsHandler
  implements IQueryHandler<GetRecommendationsQuery>
{
  async execute(): Promise<Item[]> {
    return this.ml.recommend(); // only when the flag is on
  }
}
```

### Mapping the Error to HTTP

`FeatureDisabledError` is transport-agnostic. For HTTP, map it in an exception
filter (e.g. hide the feature behind a `404`):

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { FeatureDisabledError } from '@nestjs-pipeline/feature-flags';

@Catch(FeatureDisabledError)
export class FeatureDisabledFilter extends BaseExceptionFilter implements ExceptionFilter {
  catch(error: FeatureDisabledError, host: ArgumentsHost) {
    // Hide the gated feature behind a 404.
    super.catch(new NotFoundException(error.message), host);
  }
}
```

---

## Custom Logger

`FeatureFlagBehavior` accepts a custom Nest `LoggerService` via the
`LOGGING_BEHAVIOR_LOGGER` token (useful with `nestjs-pino`). It emits only
`debug` messages, so wire it the same way as the other pipeline behaviors:

```typescript
import { NativeLogger } from 'nestjs-pino';
import { LOGGING_BEHAVIOR_LOGGER } from '@nestjs-pipeline/core';

@Module({
  providers: [{ provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger }],
})
export class AppModule {}
```

---

## Stable rollout identity

Do not use a request correlation ID as `targetingKey` for percentage rollouts. Correlation IDs normally change on every request, so the same user can move between cohorts.

Configure a stable application identity instead:

```ts
FeatureFlagsModule.forRoot({
  provider,
  targetingKeyFactory: (ctx) =>
    ctx.items.get('accountId') as string | undefined,
});
```

A handler can override the module resolver with `targetingKeyFactory`. If no factory produces a value, a `targetingKey` already supplied through module/handler evaluation context is preserved. The package intentionally does not invent a user identity.

## Variant-aware gates

Boolean evaluation can be narrowed to provider variants:

```ts
@UsePipeline([
  FeatureFlagBehavior,
  {
    flag: 'checkout-v2',
    allowedVariants: ['treatment'],
  },
])
```

The handler runs only when the flag is `true` and the provider-reported variant is allowed.

## Request-local decision metadata

The behavior evaluates a flag once and stores the result in `PipelineContext.items`:

```ts
const decision = context.items.get(FEATURE_FLAG_DECISION_ITEM);
```

`FeatureFlagDecision` includes the flag key, raw value, final enabled decision, variant, resolution reason, provider error information, and targeting key. Audit/telemetry/custom behaviors can consume this without evaluating the flag a second time.

`FEATURE_FLAG_ITEM` and `FEATURE_FLAG_KEY_ITEM` also expose the enabled decision and flag key.

## Provider failure policy

The default `errorPolicy: 'use-default'` follows OpenFeature's default-value availability model. For flags that must not silently fall back, use:

```ts
{
  flag: 'high-risk-flow',
  defaultValue: false,
  errorPolicy: 'throw',
}
```

Provider errors are surfaced as `FeatureFlagEvaluationError`.

## Stable rollout identity

The default evaluation context does not derive `targetingKey` from
`context.correlationId`. Percentage rollouts should configure a stable
user/account/device/tenant identity explicitly so one subject remains in the
same rollout bucket across requests.


## API Reference

| Export | Type | Description |
|---|---|---|
| `FeatureFlagBehavior` | Class | Pipeline behavior — gates a handler behind a boolean flag |
| `featureFlag` | Function | Type-safe intent builder returning `[FeatureFlagBehavior, options]` with required `flag` |
| `FeatureFlagIntentOptions` | Type | Options for `featureFlag(...)` requiring `flag: string` |
| `FeatureFlagsModule` | Class | `forRoot(options)` — registers the provider/client and defaults |
| `FeatureFlagBehaviorOptions` | Interface | `Per-handler options listed above, including stable targeting, variants, and error policy` |
| `FeatureFlagsModuleOptions` | Interface | ``client`, `provider`, `domain`, `context`, `waitForReady`, `defaults`, and `targetingKeyFactory`` |
| `FeatureDisabledError` | Class | Thrown when a gated flag is disabled and no `fallback` is set |
| `baseEvaluationContext` | Function | Derives the base targeting context from a pipeline request |
| `buildEvaluationContext` | Function | Merges base + module + handler targeting context |
| `FeatureFlagEvaluationError` | Class | Provider evaluation failure under `errorPolicy: 'throw'` |
| `FeatureFlagDecision` | Interface | Detailed recorded gate decision |
| `FEATURE_FLAG_DECISION_ITEM` | Symbol | Detailed decision key in `context.items` |
| `FEATURE_FLAGS_TARGETING_KEY_FACTORY` | Token | Module targeting resolver |
| `FEATURE_FLAGS_CLIENT` | Token | OpenFeature `Client` provider |
| `FEATURE_FLAGS_DEFAULT_OPTIONS` | Token | Module-wide default behavior options |
| `FEATURE_FLAGS_DEFAULT_CONTEXT` | Token | Module-wide default evaluation context |
| `FEATURE_FLAG_ITEM` / `FEATURE_FLAG_KEY_ITEM` | Symbol | `context.items` exported unique Symbol keys for the resolved value / key |


---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](../../LICENSE) and [`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
