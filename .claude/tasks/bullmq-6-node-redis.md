# Task Context

## The Bug

### In short

When Redis cannot be reached, a BullMQ worker's `close()` never finishes. Nest closes
every worker in its shutdown hooks and closes the HTTP server only after those hooks, so
`app.close()` never returns and the process keeps running until something kills it (for
example Kubernetes, after its grace period). Nothing logs an error.

It happens in two situations:

| Situation | `bullmq` 5.81 (`api` today) | `bullmq` 6.3.10 |
| --- | --- | --- |
| Redis went down while the application was running ("outage after ready") | hangs | hangs |
| Redis has been unreachable since the application started ("never connected") | closes in a few ms | hangs (new in 6) |

`ioredis` and node-redis behave the same. Upstream, the bug is
[taskforcesh/bullmq#4656](https://github.com/taskforcesh/bullmq/issues/4656) (open). Its fix
pull requests [#4839](https://github.com/taskforcesh/bullmq/pull/4839) and
[#4730](https://github.com/taskforcesh/bullmq/pull/4730) were closed unmerged, and
[#4676](https://github.com/taskforcesh/bullmq/pull/4676) is still open (see "Upstream fix"
below). 6.3.10's [#4833](https://github.com/taskforcesh/bullmq/pull/4833) ("stop infinite
connection-error retries during shutdown") does not fix it, and 6.3.11 (2026-10-01) has no
shutdown change.

### Why it happens

[`Worker#close()`](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/worker.ts#L1330-L1352)
runs its cleanup steps in order. Unless `force` is true, the first step is
[`whenCurrentJobsFinished(false)`](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/worker.ts#L1437-L1450),
which waits for two things, neither with a timeout:

1. **The blocking connection's disconnect.**
   [`backend.disconnectBlocking(true)`](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/redis-queue-backend.ts#L410-L414)
   calls
   [`RedisConnection#disconnect()`](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/redis-connection.ts#L697-L698),
   which starts with `await this.client`. That
   [`client` getter](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/redis-connection.ts#L379-L381)
   returns the connection's readiness promise
   ([`this.initializing = this.init()`](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/redis-connection.ts#L280),
   which [waits for `ready`](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/redis-connection.ts#L425-L427)).
   If Redis was never reachable, that promise never settles.
2. **The fetch loop.** `await this.mainLoopRunning` waits for the loop, which is waiting
   for a Redis reply
   ([`_getNextJob`](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/worker.ts#L763)
   → `moveToActive`). During an outage the client queues the command until it reconnects
   (BullMQ workers require `maxRetriesPerRequest: null`), so the reply never comes.

Nothing can rescue a pending close: a second `close()` returns the
[same pending promise](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/worker.ts#L1330-L1333),
and `disconnect()` waits on the same readiness promise. Only `close(true)`, decided
before the first call, skips step 1.

Why `bullmq` 5 survives "never connected": its
[`run()` awaits both Redis clients](https://github.com/taskforcesh/bullmq/blob/v5.81.5/src/classes/worker.ts#L557-L560)
before it starts the loop, so without Redis `mainLoopRunning` is never set and
`whenCurrentJobsFinished` has nothing to wait for. `bullmq` 6's `run()`
[starts the loop at once](https://github.com/taskforcesh/bullmq/blob/v6.3.10/src/classes/worker.ts#L628).

### How it reaches `api`

- [`SendWelcomeEmailProcessor`](../../api/src/users/jobs/send-welcome-email.processor.ts#L39-L45)
  and [`BatchUpdateUsersProcessor`](../../api/src/users/jobs/batch-update-users.processor.ts#L46-L52)
  call `this.worker.close()` in `onModuleDestroy`.
- `@nestjs/bullmq` closes every worker again in
  [`BullExplorer#onApplicationShutdown`](https://github.com/nestjs/bull/blob/%40nestjs/bullmq%4012.0.0/packages/bullmq/lib/bull.explorer.ts#L61-L63),
  and each queue closes its workers in
  [its shutdown hook](https://github.com/nestjs/bull/blob/%40nestjs/bullmq%4012.0.0/packages/bullmq/lib/bull.providers.ts#L68-L78).
  Both get the same pending promise.
- [`closeOnShutdownSignals`](../../api/src/graceful-shutdown.ts#L24-L47) awaits
  `app.close()` with no deadline before it flushes telemetry and re-raises the signal.

### Evidence

Run on 2026-10-01 in scratch scripts (Node 24.13.0, Redis 7 in Docker, `ioredis` 5.11.1,
node-redis `redis` 6.2.1); "unreachable" is port 1, "outage" stops the container after
the worker is ready, "healthy" closes while a 1.5 s job runs.

| Close strategy | Never connected | Outage after ready | Healthy, job in flight |
| --- | --- | --- | --- |
| `close()`, bullmq 5 | 2 ms | pending after 10 s | waits for the job |
| `close()`, bullmq 6, both clients | pending after 10 s | pending after 10 s | waits for the job |
| `close(true)`, bullmq 6 | 2 ms | 2 ms | 0 ms, job abandoned |
| `close()`, then `disconnect()` after 2 s | pending | pending | — |
| `waitUntilReady()` raced with 1 s, then `close(!ready)` | 1 s | pending (it was ready earlier) | waits for the job |
| Probe (below), then `close(!reachable)`, bullmq 5 and 6, both clients | ~1 s, forced | ~1 s, forced | ~1.2 s, job finished |

The probe answers "reachable" only if Redis replies within 1 s: `ping()` on the
application-owned node-redis client, or on bullmq 5 `(await worker.client).ping()`; on
bullmq 6 with `ioredis`, `getBackend().client` raced with 1 s and `status === 'ready'`.
`getBackend().client` with node-redis is a `NodeRedisAdapter` without `ping()`.

Minimal reproduction (no Redis needed; `bullmq` 6 hangs, 5 exits):

```js
const { Worker } = require('bullmq');

const worker = new Worker('probe', async () => {}, {
  connection: { host: '127.0.0.1', port: 1, maxRetriesPerRequest: null },
});
worker.on('error', () => {});
setTimeout(async () => {
  const pending = setTimeout(() => console.log('close() still pending after 10 s'), 10_000);
  await worker.close();
  clearTimeout(pending);
  console.log('close() settled');
}, 500);
```

### Upstream fix: PR #4676

[#4676](https://github.com/taskforcesh/bullmq/pull/4676) ("fix(worker): close when Redis is
unreachable", "Fixes #4656") targets `master`, the `bullmq` 6 line; it has no 5.x backport.
On 2026-10-01 it was open, conflicted with `master` (`mergeable_state: dirty`) and was in no
release. Read from its diff on that date:

- `RedisConnection` gains a closing signal: `close()` resolves it, and `waitUntilReady()`
  races it, so a close cancels a pending readiness wait.
- `disconnect()` disconnects at once when the client is not `ready`, instead of waiting for
  an `end` event that a socketless reconnecting client never emits.
- `Worker#close()` passes "no reconnect" to `whenCurrentJobsFinished()`, which then closes
  the blocking connection with `close(true)`, and closes the regular connection too while
  it is still initializing.
- Its regression tests (ioredis, node-redis, Bun) close a worker before the first
  connection: graceful, forced, and repeated `close()`.

| Situation | Expected with #4676 |
| --- | --- |
| Never connected | Fixed, and covered by its tests. |
| Outage after ready | Partly. The blocking connection now closes at once, but `close()` still awaits `mainLoopRunning`. If the loop waits for a command queued on the regular connection, that connection was `ready` before the outage, so it is not closed early and the wait stays. No test of #4676 covers this case. This is a code-path inference, to verify against the release. |

## Task

Once BullMQ releases #4676, move `api` to `bullmq` 6 with node-redis clients, verify both
outage situations against that release, and fix on our side what it leaves: the
"outage after ready" hang, if it remains, and a deadline on `app.close()`.

## Goal

- `app.close()` settles within about a second when Redis is unreachable, in both
  situations above, and still waits for in-flight jobs when Redis is healthy.
- `api` runs `@nestjs/bullmq` 12 with a `bullmq` 6 release that contains #4676, and BullMQ
  uses a node-redis client the application owns, so `api` uses one Redis client library.
- Tests cover both outage situations and the healthy case.

## Scope

In scope: `api/src/users/jobs/`, `api/src/common/modules/reliability.module.ts`,
`api/src/graceful-shutdown.ts`, a worker-close helper in `api/src/common/` (only if step 4
needs it), `api/test/`, `api/package.json`, `api/README.md`, `api/CLAUDE.md`,
`.claude/codebase-map.md`.

Out of scope: `packages/*` (the dead-letter transport is typed structurally and needs no
change), the cache's `@keyv/redis` client (it pins `@redis/client` 5), a fix inside
BullMQ itself, a fix on `bullmq` 5.

## Current Status

Waiting upstream: #4676 is open, conflicts with BullMQ's `master` and is in no release
(latest `bullmq` 6.3.11, 2026-10-01). Nothing in `api` changes until it ships.

## Plan

- [ ] 1. **Wait for the release.** #4676 merged and released in a `bullmq` 6.x version
  (#4656 closed; the release notes name it). Re-read its merged diff: the summary above
  describes the open PR, which may change before it merges. The version must also be older
  than pnpm's minimum release age.
- [ ] 2. **`bullmq` 6 with node-redis**, on that release.
  - `bullmq` at that version, and node-redis 6 as a runtime dependency. Check whether
    BullMQ's optional `redis` peer needs the `redis` package or accepts an `@redis/client`
    client.
  - A provider for one node-redis client, built from `redisConfig()`, connected at
    startup and closed after BullMQ in `onApplicationShutdown`. BullMQ leaves
    caller-owned clients open and owns the duplicates it makes for blocking connections.
  - `BullModule.forRootAsync({ inject: [<client token>], useFactory: (client) =>
    ({ connection: client }) })`.
  - Check `forceDisconnectOnShutdown` with a shared, caller-owned client: does
    `Queue#disconnect()` close the application's client for the other queues?
  - Removed `bullmq` 6 APIs: none used (checked during the NestJS 12 upgrade: no
    `Queue#client`, `redisVersion`, `databaseType`, `repeat`, `debounce`,
    `Worker#resume()`, `Job#discard()`).
- [ ] 3. **Tests first, against that release**, with a Testcontainers Redis:
  - healthy: an in-flight job completes on `app.close()`;
  - never connected: start against a closed port, then `app.close()` settles quickly
    (expected to pass with #4676);
  - outage after ready: stop the container once the workers are ready, then `app.close()`
    settles quickly (expected to fail if the main-loop wait remains).
- [ ] 4. **Fix what remains on our side.**
  - Only if "outage after ready" still hangs: a helper in `api/src/common/` that closes a
    worker gracefully when the application-owned node-redis client answers a ping within
    1 s, and with `close(true)` otherwise, logging a warning when it forces. Both
    processors call it in `onModuleDestroy`, which runs before `@nestjs/bullmq`'s
    `onApplicationShutdown`, so the explorer's later `close()` gets the settled promise.
  - Always: a deadline on `app.close()` in `graceful-shutdown.ts` as the last resort, for
    Redis failing during a graceful close and for hangs we do not know about: log an
    error, then flush telemetry and re-raise the signal as today.
  - The step 3 tests pass.
- [ ] 5. **Docs and context**: client ownership and shutdown behavior in `api/README.md`
  and `api/CLAUDE.md`, the map's Gotchas, then delete this file.

## Decisions

- Wait for #4676 instead of fixing the hang on `bullmq` 5 first (owner decision,
  2026-10-01). Until it ships, `api` on `bullmq` 5.81 keeps the "outage after ready" hang.
- If a helper is needed, it chooses graceful or forced before the first `close()` call:
  `close()` returns its first promise forever, and `disconnect()` hangs as well.
- Force only when Redis does not answer within 1 s. In-flight jobs cannot complete during
  an outage anyway; BullMQ retries them as stalled jobs after their locks expire (BullMQ's
  documented behavior, not verified here).
- Keep a deadline on `app.close()` as the last resort, whatever #4676 fixes.
- The probe pings the application-owned node-redis client, so it relies on no BullMQ
  internals.
- Rejected, each tested on `bullmq` 6.3.10: `disconnect()` after a deadline (hangs);
  `waitUntilReady()` as the probe (it stays resolved after an outage); a per-worker
  deadline alone (the explorer's later `close()` awaits the same pending promise); always
  `close(true)` (abandons in-flight jobs on a normal shutdown).

## Modified Files

None yet.

## Tests and Verification

Only the scratch reproductions above, and the reading of #4676's open diff on 2026-10-01.
Nothing in the repository has changed yet.

## Risks

- Until step 4 is done, a SIGTERM during a Redis outage leaves `api` running until it is
  killed (`bullmq` 5.81, "outage after ready"); nothing logs it.
- #4676 may change before it merges, or never merge; its predecessors #4839 and #4730 were
  closed unmerged. If it stalls, revisit the decision to wait.
- A forced close during an outage leaves in-flight jobs to the stalled-job check, so they
  run again once Redis is back; processors must stay idempotent (both are simulated
  today).
- The probe adds up to 1 s to a shutdown, and only when Redis is slow to answer.
- node-redis 6 defaults to RESP3; BullMQ 6 is tested with `redis` 6.2.1.
- Two node-redis versions stay installed while `@keyv/redis` pins `@redis/client` 5.

## Open Questions

- How long should the `app.close()` deadline be, for example 10 s, below Kubernetes'
  default 30 s grace period? (Not blocking.)
- Should our evidence about "outage after ready" be added to bullmq#4656 or #4676?
  (Outward-facing; the repository owner decides.)
- Trace BullMQ jobs, here or as a task of its own? `api`'s processors do not dispatch
  through the `CommandBus`, so a job gets no span. BullMQ has a `telemetry` option, and
  `bullmq-otel` 2.0.1 implements it with OpenTelemetry. (Not blocking.)
- `RedisIdempotencyStore` sends `SET` with the flat `PX`/`NX` options, which node-redis 6
  deprecates for `expiration`/`condition`. Moving to the new form drops node-redis 4, which
  the idempotency README still names as supported; decide before node-redis removes them.
  (Not blocking.)

## Next Steps

1. Check #4676 and the BullMQ releases: `gh pr view 4676 --repo taskforcesh/bullmq`,
   `pnpm view bullmq dist-tags`.
2. Once a release contains it, read `CLAUDE.md`, `AGENTS.md`, the architecture skill
   (queues, module wiring) and `api/CLAUDE.md`, then start step 2.

## Snapshot Impact

Yes, after step 2: dependencies (`bullmq` 6, node-redis at runtime) and `api`'s shutdown
wiring. Run `pnpm context:update`, then edit the map's Gotchas by hand.

## Last Updated

2026-10-01
