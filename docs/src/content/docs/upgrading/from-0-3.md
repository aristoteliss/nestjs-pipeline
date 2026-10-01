---
title: "Upgrading from 0.3.x"
sidebar:
  order: 1
---

0.4.0 publishes every package as an ES module. The API, the requirements (Node.js 22.12,
NestJS `^12.1.0`) and the behavior are those of 0.3.0; [CHANGELOG.md](/nestjs-pipeline/changelog/) lists
the changes.

**1. ES modules.** Every package declares `"type": "module"` and an `exports` map. An ES
module application imports it; a CommonJS application loads it with `require()`, which
Node.js supports from 22.12. A CommonJS application that compiles with TypeScript
`module: node16` moves to `nodenext`, `node20` or `bundler`, as NestJS 12 already requires;
this is new for applications that use only the `@cqrs-ddd/*` packages.

**2. Entry points only.** A package resolves through its `exports` map: its root,
`@cqrs-ddd/core`'s `/domain`, `/application`, `/persistence` and `/http`, and
`/package.json`. An import of a path inside `dist` no longer resolves; import the same name
from the entry point.

```bash
pnpm add @nestjs-pipeline/core@^0.4.0
```
