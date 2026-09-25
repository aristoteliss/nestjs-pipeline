# Packed release verification

Run `pnpm test:release` before publishing. It rebuilds the workspace, copies the
licenses, and runs `release.mjs`. It is also part of `pnpm verify:all`.

The script discovers every non-private `packages/*/package.json`, packs it, and
checks the archive identity/version, licenses, JavaScript, declarations, an
`engines.node` equal to the root `package.json`'s, a README without relative links
outside the package (they break on npmjs.com), and absence of tests or
workspace/private DDD dependencies. Missing, duplicate, and
unexpected archives fail the check.

A temporary consumer outside the checkout installs every package from its tarball.
Required peer dependencies are installed at the versions recorded in the workspace
lockfile. Installation checks declared peer ranges, with automatic peer installation
disabled. Optional peers are not explicitly installed. Dependencies between workspace
packages resolve to the local tarballs.

The consumer compiles package imports with TypeScript and runs them with Node.
Its fixtures test:

- Request-scoped behaviors and isolation between two Nest applications.
- Option types for `logging`, `metrics`, `trace` and `deadLetter`, and whether they
  produce the same decorator metadata as raw tuples.
- CASL 7 authorization and Nest module startup with an application permission source.

These tests use package root imports. They do not cover every export, subpath or
supported dependency version.

New published packages are discovered automatically. Add consumer tests under
`consumer/src/`; every `.ts` file there is compiled and run. Packages requiring
incompatible peer versions need separate consumer installations.

Requirements: the repository's Node/pnpm versions, `tar`, and registry access for
uncached dependencies. Temporary files are removed on completion or failure.
