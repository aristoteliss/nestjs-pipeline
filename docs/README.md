# docs — the documentation site

The site published at [aristoteliss.github.io/nestjs-pipeline](https://aristoteliss.github.io/nestjs-pipeline/),
built with [Starlight](https://starlight.astro.build/). It is private and never published to npm.

## Where the content comes from

| Section | Source | Produced by |
| --- | --- | --- |
| Overview, Changelog, Packages | the root `README.md`, `CHANGELOG.md` and each package's `README.md` | `scripts/sync-readmes.mjs`, at every build |
| API reference | the packages' JSDoc | TypeDoc, through `starlight-typedoc` |
| HTTP API | `api/dist/openapi.json`, from the api's controllers and Zod schemas | `pnpm --filter @nestjs-pipeline/ddd-api openapi`, rendered by `starlight-openapi` |
| Home page | `src/content/docs/index.mdx` | written here |

Generated pages are gitignored. Edit the README or the JSDoc they come from, never the generated
copy. The sync script turns links between README files into links between pages; links to any
other repository file point to GitHub.

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
