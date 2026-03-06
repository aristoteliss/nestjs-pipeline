# @nestjs-pipeline/correlation

Standalone correlation ID propagation for NestJS applications. Works with HTTP,
Bull/BullMQ, RabbitMQ, Kafka, NATS, gRPC, cron jobs, and any custom transport.

Part of the [@nestjs-pipeline](https://github.com/aristoteliss/nestjs-pipeline) monorepo.

## Installation

```bash
npm install @nestjs-pipeline/correlation
# or
pnpm add @nestjs-pipeline/correlation
```

> **Tip:** To bridge correlation IDs into the pipeline context, pass `getCorrelationId`
> as the `correlationIdFactory` option in `PipelineModule.forRoot()`.

## Features

- **`correlationStore`** — `AsyncLocalStorage` holding the current correlation ID
- **`getCorrelationId()`** — Read the active ID anywhere in the call stack
- **`runWithCorrelationId(id, fn)`** — Execute a callback inside a correlation context
- **`addCorrelationId(data)`** — Stamp the current ID onto a payload (producer-side)
- **`correlationHeaders(key?)`** — Return a headers object for header-based transports
- **`@WithCorrelation()`** — Decorator for non-HTTP entry points (Bull, RabbitMQ, etc.)
- **`CorrelationFrom`** — Pre-built extractors for AMQP, Kafka, NATS, gRPC
- **`HttpCorrelationMiddleware`** — NestJS middleware for HTTP correlation
- **`uuidv7()`** — Timestamp-sortable UUID per RFC 9562
