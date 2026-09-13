# Production usage notes

This branch turns `pipeline-feature-flags` into a pipeline-specific OpenFeature integration rather than a thin boolean wrapper. OpenFeature remains the provider/evaluation abstraction; this package owns CQRS gating, request context, rollout identity, variants, fallback behavior, and decision metadata.

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

The legacy `FEATURE_FLAG_ITEM` and `FEATURE_FLAG_KEY_ITEM` entries remain available.

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

## Migration note

The default evaluation context no longer sets `targetingKey` to `context.correlationId`. This is intentional and may change percentage-rollout assignment for applications that relied on the old behavior. Configure a stable user/account/device/tenant identity explicitly before merging this branch.
