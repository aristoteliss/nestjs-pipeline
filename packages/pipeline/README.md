# @nestjs-pipeline/core

> NestJS CQRS pipeline behavior base library.

Provides the foundational building blocks for wrapping NestJS CQRS handlers (commands, queries, events) with an ordered chain of cross-cutting behaviors — without introducing any additional runtime dependencies beyond NestJS itself.

---

## Concepts

| Concept | Description |


## Installation

```bash
pnpm add @nestjs-pipeline/core
```

Peer dependencies that must be installed in your application:

```bash
pnpm add @nestjs/common @nestjs/core @nestjs/cqrs reflect-metadata rxjs
```

---

## Usage

### 1. Create a custom behavior

```typescript

```

### 2. Wrap a NestJS CQRS handler

```typescript

```

> **Note** — `ICommandHandler.execute()` maps to `IPipelineHandler.handle()`.
> Wrap the handler in a NestJS provider factory or override `execute` to delegate
> through the pipeline.

### 3. Build the pipeline

```typescript

```

---

## Creating add-on packages

Each additional package in this monorepo follows the same pattern:

```
packages/
  pipeline-<name>/
    package.json        # peerDep on @nestjs-pipeline/core + the 3rd-party lib
    src/
      behaviors/
        <name>.behavior.ts
      index.ts
```

Install `@nestjs-pipeline/core` as a peer dependency:

```json
{
  "peerDependencies": {
    "@nestjs-pipeline/core": "*"
  }
}
```

---

## License and Commercial Use

This software is **Dual-Licensed**. 

By default, this project is licensed under the **GNU AGPLv3** (see the `LICENSE` file). This means you can use, modify, and distribute it freely, provided that your entire application is also open-sourced under the AGPLv3.

**Commercial License (No AGPL Restrictions)**
If you are using this software for commercial purposes and cannot (or do not want to) open-source your application under the AGPLv3, you must use the **Commercial License** (see the `COMMERCIAL_LICENSE.txt` file).

The Commercial License pricing is designed to be fair and scales based on your organization's total gross annual revenue:
* **Under $500,000 USD/year:** Free 
* **$500,001 - $10,000,000 USD/year:** 0.1% of gross revenue
* **$10,000,001 - $50,000,000 USD/year:** 0.05% of gross revenue
* **Over $50,000,000 USD/year:** 0.01% of gross revenue (Capped at $50,000 max/year)

To pay the commercial fee or register your free commercial tier, please contact: [Insert Your Email/Website]