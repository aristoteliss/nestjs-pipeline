# Packed release verification

Run `pnpm test:release` before publishing. It rebuilds the workspace, copies the
licenses, and runs `release.mjs`. It is also part of `pnpm verify:all`.

The script discovers every non-private `packages/*/package.json`, packs it, and
checks the archive identity/version, licenses, JavaScript, declarations, and
absence of tests or workspace/private DDD dependencies. Missing, duplicate, and
unexpected archives fail the check.

A temporary consumer outside the checkout installs every package from its tarball.
Required external peers come from package manifests, including required peers of
external peers, at the exact versions installed in the workspace lockfile graph. Strict peer validation checks their advertised ranges;
automatic peer installation is disabled. Optional peers are not explicitly installed.
All package-family dependencies are overridden to the local tarballs.

Generated static imports compile with TypeScript and load with Node. The fixtures
also check request-scoped core behavior, isolation between two Nest applications,
and CASL 7 authorization. This checks public root entry points; it is not an
exhaustive check of every exported API, subpath, or supported dependency version.

Adding a published package requires no fixture list update. Keep its dependencies
and peers accurate. Add a fixture only for behavior that needs a separate consumer
check. If packages require incompatible peer versions, reconcile their contracts
or explicitly add a separate consumer scenario.

Requirements: the repository's Node/pnpm versions, `tar`, and registry access for
uncached dependencies. Temporary files are removed on completion or failure.
