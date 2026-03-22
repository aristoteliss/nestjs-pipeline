# @nestjs-pipeline/ddd-users-api

A complete NestJS application demonstrating `@nestjs-pipeline` with Domain-Driven Design.

## Overview

This sample builds on `@nestjs-pipeline/ddd-core` to show a full CQRS + DDD stack:

- **Domain layer** — `User` entity extending `RootEntity`, domain events (`UserCreatedEvent`, `UserUpdatedEvent`, `UserDeletedEvent`), and outcomes (`UserCreateOutcome`, `UserUpdateOutcome`).
- **CQRS layer** — Command/query handlers with `@UsePipeline` behaviors, validated via `createRequest()` and Zod schemas.
- **Event handlers** — React to domain events, enqueue background jobs via BullMQ.
- **Controllers** — REST endpoints with `ZodPipe` validation and correlation ID propagation.

## Getting Started

```bash
cd ddd/users-api
pnpm install
pnpm start
```

## What it demonstrates

- Global + per-handler pipeline behaviors
- Zod-validated commands, queries, and events via `createRequest()`
- Controller-level `ZodPipe` validation
- OpenTelemetry tracing with `TraceBehavior`
- DDD-style `User` entity built on `ddd-core` primitives (`RootEntity`, `RootDomainEvent`, `RootDomainOutcome`)
- Correlation ID propagation across handlers and events
- Express and Fastify adapter support
- BullMQ background job processing

## Dependencies

- `@nestjs-pipeline/core`
- `@nestjs-pipeline/ddd-core`
- `@nestjs-pipeline/correlation`
- `@nestjs-pipeline/opentelemetry`
- `@nestjs-pipeline/zod`
