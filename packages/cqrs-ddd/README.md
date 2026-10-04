# @nestjs-pipeline/cqrs-ddd

The NestJS adapter of the `@cqrs-ddd` packages under its `@nestjs-pipeline` name. It holds
no code: every entry point (`.`, `./correlation`, `./job-context`) re-exports
[`@cqrs-ddd/nestjs`](https://aristoteliss.github.io/ddd-cqrs/packages/nestjs/), which it depends on. Read that package's README
for what it does; new code can install `@cqrs-ddd/nestjs` directly.

```bash
pnpm add @nestjs-pipeline/cqrs-ddd @cqrs-ddd/pipeline @cqrs-ddd/core
```
