# @cqrs-ddd/nestjs

The NestJS adapter of the [`@cqrs-ddd`](https://github.com/aristoteliss/ddd-cqrs) packages.
Your application keeps NestJS and official `@nestjs/cqrs`; this package adds what NestJS
lacks:

- `PipelineModule.forRoot({ globalBehaviors, sources, diagnostics })` runs every
  `@nestjs/cqrs` handler through the behaviors of its `@UsePipeline`. Each module provides
  the behaviors it configures under their class; startup fails on a missing or doubly
  provided behavior and on a request-scoped handler that runs behaviors.
- `ErrorFilter` (global, `APP_FILTER`) answers every `@cqrs-ddd` error as a NestJS
  `HttpException` with NestJS's body (`statusCode`, `message`, `error`); `toHttpException`
  and `httpAnswer` do the conversion alone.
- `@cqrs-ddd/nestjs/correlation`: `CorrelationMiddleware`.
- `@cqrs-ddd/nestjs/job-context`: `JobContextModule.forRoot({ principal, tenants, sources })`.

```ts
@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      sources: { tenantId: tenantSource, correlationId: correlationSource },
      globalBehaviors: [{ scope: 'all', before: [logging()] }],
    }),
  ],
  providers: [
    { provide: LoggingBehavior, useFactory: () => new LoggingBehavior(new Logger('Pipeline')) },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
```

## Install

```bash
pnpm add @cqrs-ddd/nestjs @cqrs-ddd/pipeline @cqrs-ddd/core
```

Peers: `@nestjs/common`, `@nestjs/core` and `@nestjs/cqrs` 12, `@cqrs-ddd/pipeline` and
`@cqrs-ddd/core` 0.5. The behavior packages (`-zod`, `-casl`, `-feature-flags`,
`-rate-limit`, `-idempotency`, `-correlation`, `-job-context`) are optional peers: their
errors are converted when they are installed. Node.js 22.12 or newer.

A complete application: [`api/`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/api).
