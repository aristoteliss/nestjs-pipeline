---
title: "The built-in LoggingBehavior"
---

The core package ships with `LoggingBehavior` that logs request/response data and timing metrics via the NestJS `Logger`:

```typescript
import { LoggingBehavior } from '@nestjs-pipeline/core';

// Register globally with default options
PipelineModule.forRoot({
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
})
```

**Options** (`LoggingBehaviorOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `metricLogLevel` | `LogLevel \| 'none'` | `'log'` | Log level for timing/duration messages |
| `requestResponseLogLevel` | `LogLevel \| 'none'` | `'debug'` | Log level for request/response payloads |
| `errorLogLevel` | `LogLevel \| 'none'` | `'error'` | Log level when an error happened |
| `mapLogLevel` | `Map<ErrorClass, LogLevel \| 'none'>` | `undefined` | Specific log levels mapped by exception error class (most specific match in prototype chain wins) |
| `excludeKeys` | `string[]` | `[]` | Keys to omit from request/response logs (supports dot notation for nested properties) |
| `excludeRequestObj` | `boolean` | `true` | If true, omits the request object from logs entirely (shows placeholder instead) |
| `excludeResponseObj` | `boolean` | `true` | If true, omits the response object from logs entirely (shows placeholder instead) |
| `logFormat` | `'text' \| 'structured'` | `'text'` | Output shape for request/response/metric/error logs. `'text'` produces a single interpolated string; `'structured'` produces a plain object (e.g. `{ msg, request }`), useful for structured loggers like `nestjs-pino`/pino that serialize to JSON |

> By default `excludeRequestObj`/`excludeResponseObj` are `true`, so out of the box you'll see the placeholders `[exclude request obj]` / `[exclude response obj]` rather than the actual payload — set them to `false` to log the real request/response.

On failure, the error log also includes the thrown error's `stack` (when it's an `Error` instance) and, if the error exposes an `optionalParams` property (e.g. a custom exception carrying extra structured context), those values are appended to the log entry as well.

To provide your own logger implementation (for example `nestjs-pino`), bind the `LOGGING_BEHAVIOR_LOGGER` token:

```typescript
import { Module } from '@nestjs/common';
import { NativeLogger } from 'nestjs-pino';
import {
  LOGGING_BEHAVIOR_LOGGER,
  LoggingBehavior,
  PipelineModule,
} from '@nestjs-pipeline/core';

@Module({
  imports: [
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
      bootstrapLogLevel: 'verbose',
    }),
  ],
  providers: [
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger },
  ],
})
export class AppModule {}
```

When using `nestjs-pino`, Nest log levels map to pino as:
`verbose` → `trace`, `debug` → `debug`, `log` → `info`, `warn` → `warn`, `error` → `error`, `fatal` → `fatal`.
If you use `bootstrapLogLevel: 'verbose'`, set pino `level: 'trace'`.

```typescript
// Verbose logging for a specific handler
@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler { /* ... */ }

// Map specific exceptions to different log levels (e.g. log constraint violations as warnings)
@UsePipeline([LoggingBehavior, { 
  mapLogLevel: new Map([
    [UniqueConstraintException, 'warn'],
    [NotFoundException, 'debug'],
  ]) 
}])

// Disable payload logging entirely, keep timing metrics
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'none' }])

// Disable all logging for a handler
@UsePipeline([LoggingBehavior, { metricLogLevel: 'none', requestResponseLogLevel: 'none' }])
```

`LoggingBehavior` logs under the **handler's** context, not its own. The handler name is passed with each log call, so a singleton logger is never mutated and concurrent handlers cannot overwrite one another's context. With `excludeRequestObj: false, excludeResponseObj: false`:

**Output example** (on success):

```
[Nest] LOG   [CreateUserHandler] Request: {"username":"jane","email":"jane@example.com"}
[Nest] LOG   [CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms
[Nest] DEBUG [CreateUserHandler] Response: {"id":"...","username":"jane","email":"jane@example.com"}
```

**Output example** (on error):

```
[Nest] ERROR [CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler failed after 2.10ms: Error: User already exists
```
