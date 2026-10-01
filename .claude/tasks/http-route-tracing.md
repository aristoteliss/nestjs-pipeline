# Task Context

## Task

Name `api`'s HTTP server spans by their route (`GET /users/:id`, with `http.route`) through
OpenTelemetry's own HTTP instrumentation, and drop
`@opentelemetry/instrumentation-nestjs-core`, so that `api`'s tracing depends on no
Nest-version-specific instrumentation.

## Goal

- On Express and Fastify, every HTTP server span of a matched route carries `http.route`
  (the route template) and is named `<METHOD> <route>`.
- `api` no longer depends on `@opentelemetry/instrumentation-nestjs-core`; a Nest major
  upgrade cannot silently remove route data from the traces.
- A spec in `api/test/` fails before the change and passes after it, on both adapters.

## Scope

In scope: `api/src/tracing.ts`, a new `api/src/common/interceptors/http-route.interceptor.ts`
and its spec, `api/src/common/modules/observability.module.ts` (registration),
`api/package.json`, `api/README.md` (tracing section), `.claude/codebase-map.md`.

Out of scope: `packages/*` (the pipeline's `TraceBehavior` keeps command, query and event
spans); metrics (`api`'s `NodeSDK` has no metric reader); BullMQ job tracing (an open
question of the NestJS 12 upgrade: BullMQ's `telemetry` option with `bullmq-otel`).

## Background

- On Nest 12, `@opentelemetry/instrumentation-nestjs-core` 0.68.0 produces no spans: it
  patches only `@nestjs/core` `>=4.0.0 <12`, and Nest 12's internal files load as ES
  modules, which its `require` hook never sees. Upstream's fix (contrib#3733) is merged
  and waits for 0.69 (release PR contrib#3719). Until then `api`'s HTTP spans are named
  `GET`/`POST` only, with no `http.route`. This is step 10.5 of
  `.claude/tasks/nestjs-12-upgrade.md`; raising to 0.69 restores the spans without this
  task.
- A `pnpm patch` of 0.68.0 with contrib#3733 worked in a scratch check but was rejected by
  the owner.
- The contract this task uses, read in `@opentelemetry/instrumentation-http` 0.222.0:
  - every incoming request's context carries a mutable RPC metadata object
    (`{ type: RPCType.HTTP, span }`, set with `setRPCMetadata`, `build/src/http.js`
    lines 346-350);
  - when the response finishes, `getIncomingRequestAttributesOnResponse` reads
    `getRPCMetadata(context.active()).route` (`build/src/utils.js` lines 564-566), sets
    `http.route`, and `_onServerResponseFinish` renames the span to
    `${method} ${route}` (`build/src/http.js` lines 479-481).
  - `@opentelemetry/instrumentation-express` and `-fastify` set `rpcMetadata.route` the
    same way; it is the public contract between the HTTP and framework instrumentations.
- `getRPCMetadata` and `RPCType` come from `@opentelemetry/core` (2.11.0 under
  `@opentelemetry/sdk-node` 0.222.0), which `api` has only transitively today.

## Current Status

Not started. Recorded on 2026-10-01; the owner chose to leave it for later.

## Plan

- [ ] 1. **Spec first.** `api/test/http-route-tracing.spec.ts`, for Express and Fastify:
  start a `NodeSDK` with an in-memory exporter (`tracing.InMemorySpanExporter` with a
  `SimpleSpanProcessor`) and `HttpInstrumentation`, start a Nest application with a
  controller route `/probes/:id`, request `/probes/42`, flush the processor (the first
  export can wait for resource detection), and expect a server span named
  `GET /probes/:id` with `http.route` `/probes/:id`. It should fail before step 2. Check
  first that `HttpInstrumentation` patches `http` inside a Vitest worker; if it does not,
  run the check as a script instead and record why.
- [ ] 2. **`HttpRouteInterceptor`** in `api/src/common/interceptors/`, registered as an
  `APP_INTERCEPTOR` in `ObservabilityModule`. For an `http` context it reads the matched
  route template, `req.route?.path` on Express or `request.routeOptions?.url` on Fastify,
  and sets `getRPCMetadata(context.active()).route` when the metadata's type is
  `RPCType.HTTP`. JSDoc with an `@example`. Check that Express's `req.route.path` and
  Fastify's `routeOptions.url` give the same template, including a controller prefix.
- [ ] 3. **Dependencies.** Add `@opentelemetry/core` (`^2.11.0`) to `api`; remove
  `@opentelemetry/instrumentation-nestjs-core` from `api/package.json` and
  `new NestInstrumentation()` from `api/src/tracing.ts`.
- [ ] 4. **Verify.** `api` build, lint and test; `pnpm test:e2e`; the step 10.4 scratch
  check (`tracing.ts`'s SDK setup with an in-memory exporter, run from `api/` so
  `require.main` resolves `api`'s modules): route-named server spans on both adapters,
  PostgreSQL spans unchanged.
- [ ] 5. **Docs.** `api/README.md` (what the traces contain), the map's Gotchas (the
  interceptor sets the route; a guard rejection keeps the bare method name), and close
  step 10.5 of the upgrade task as superseded.

## Decisions

- Proposed: fill the HTTP instrumentation's RPC metadata from a Nest interceptor. It uses
  public APIs only (a Nest interceptor, `@opentelemetry/core`'s RPC metadata) and costs
  one context lookup per request.
- Rejected:
  - a `pnpm patch` of 0.68.0 (owner decision);
  - `@nestjs/observe` and spans built on Nest 12's `instrument.instanceDecorator`
    (evaluated in upgrade step 11b);
  - `HttpInstrumentation`'s `applyCustomAttributesOnSpan`: it receives the raw Node
    request, which carries Express's `route` but not Fastify's;
  - a guard that tags the route so that guard rejections are named too: a guard is an
    authorization boundary, not a telemetry hook.

## Modified Files

None yet.

## Tests and Verification

Only the facts above, read from the installed packages on 2026-10-01. Nothing is
implemented.

## Risks

- Lost compared with a working NestJS instrumentation: the `Create Nest App`
  (`app_creation`) span and the per-handler `request_context` and `handler` spans.
  Command and query spans from `TraceBehavior` stay, under the HTTP span.
- A request a guard rejects (401, 403) never reaches interceptors, so its span keeps the
  bare method name (`GET`). That keeps cardinality low but loses the route for those
  responses.
- The route is read from adapter-specific request properties (`req.route` on Express,
  `routeOptions` on Fastify); a major release of either can rename them, and the spec
  must catch that.
- No test loads `api/src/tracing.ts` itself; a change to its instrumentation list stays
  invisible to the test suite.

## Open Questions

- Do or skip, once `instrumentation-nestjs-core` 0.69 is out? 0.69 restores the Nest spans
  without code; this task removes the dependency and names the HTTP spans by route instead.
- Should guard rejections also carry the route? (Would need a hook before guards that
  Nest does not offer publicly.)

## Next Steps

1. Decide the open question above.
2. Start step 1 (spec first).

## Snapshot Impact

Yes, small: an `api` dependency changes and a global interceptor is added. Run
`pnpm context:update` and update the map's Gotchas by hand.

## Last Updated

2026-10-01
