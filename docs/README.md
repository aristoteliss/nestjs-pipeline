# docs — the documentation site

The site published at [aristoteliss.github.io/nestjs-pipeline](https://aristoteliss.github.io/nestjs-pipeline/),
built with [Starlight](https://starlight.astro.build/). It is private and never published to npm.

## Where the content comes from

| Section | Source |
| --- | --- |
| Home, Overview, Getting started, Concepts, Guides, Packages, Upgrading, Release notes | the committed pages in `src/content/docs/` — edit them here |
| Changelog | the repository's `CHANGELOG.md`, copied at every build by `scripts/sync-changelog.mjs` |
| API reference | the packages' JSDoc, through TypeDoc and `starlight-typedoc` |
| HTTP API | `api/dist/openapi.json`, written by `pnpm --filter @nestjs-pipeline/ddd-api openapi` from the api's controllers and Zod schemas, rendered by `starlight-openapi` |

The package READMEs are short and point to these pages; npm shows them. The generated
Changelog and API reference pages are gitignored.

## Commands

From the repository root:

```bash
pnpm docs:build   # packages, api, its OpenAPI document, then the site in docs/dist
pnpm docs:dev     # local server; run pnpm docs:build once first
```

The site's own build script is `build:site`, so `pnpm -r build` does not build it.

## Checks

The build fails on a broken internal link or anchor (`starlight-links-validator`) and on a TypeDoc
error. TypeDoc 0.28 supports TypeScript up to 6.0, so this workspace pins TypeScript 6.0 while the
packages build with TypeScript 7.

## Deployment

`.github/workflows/docs.yml` runs `pnpm docs:build` on every push to `master` and publishes
`docs/dist` to GitHub Pages. In the repository settings, Pages > Source must be GitHub Actions.
