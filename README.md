# nestjs-pipeline

A pnpm monorepo of NestJS CQRS pipeline behavior packages.

## Packages

| Package | Version | Description |
|---|---|---|
| [`@nestjs-pipeline/core`](packages/pipeline) | 0.1.0 | Base pipeline |

> Add-on packages live in `packages/pipeline-<name>/` and peer-depend on `@nestjs-pipeline/core`.

---

## Repository structure

```
nestjs-pipeline/
├── package.json            # root — private, workspace scripts
├── pnpm-workspace.yaml     # declares packages/*
├── tsconfig.base.json      # shared TS config
└── packages/
    └── pipeline/           # @nestjs-pipeline/core
        ├── package.json
        ├── tsconfig.json
        ├── tsconfig.build.json
        └── src/
            ├── index.ts
            ├── pipeline.ts
            ├── interfaces/
            │   ├── pipeline-handler.interface.ts
            │   └── behavior.interface.ts
            └── behaviors/
                └── pipeline-behavior.base.ts
```

---

## Getting started

```bash
# Install dependencies for all packages
pnpm install

# Build all packages
pnpm build

# Lint (type-check) all packages
pnpm lint
```

## Adding a new behavior package

1. Create `packages/pipeline-<name>/` following the same structure.
2. Add `@nestjs-pipeline/core` as a peer dependency.
3. Implement your behavior by extending `PipelineBehavior`.
4. Export it from `src/index.ts`.
5. The package is automatically included in the workspace via `pnpm-workspace.yaml`.

## Publishing to npm

```bash
# Publish all packages (requires npm login)
pnpm publish:all
```

Each package must have `"publishConfig": { "access": "public" }` in its `package.json`
and `"private"` must **not** be set to `true`.

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

To pay the commercial fee or register your free commercial tier, please contact: aristotelis@ik.me