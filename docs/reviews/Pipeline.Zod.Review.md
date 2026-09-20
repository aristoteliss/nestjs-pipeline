# pipeline-zod package review

Date: 2026-09-20. Baseline: `12d912c8` (`review/remaining-findings`).
Delivery branch: `review/remaining-findings`.

## Scope and method

This review covers all of `packages/pipeline-zod`: `ZodValidationBehavior`, the
`createZodRequest` / `createCommand` / `createQuery` factories, the data helpers
(clone, structural equality, mutation tracking, raw-input and validated-data
accessors), the request-output assertions, `ZodPipe`, `ZodValidationFilter`,
`ZodValidationError`, the public entry point and the README. `ddd/users-api`
supplies the real consumer path — `BaseCommand` / `BaseQuery` with non-enumerable
session metadata, global registration in `ObservabilityModule`, controller
`ZodPipe` usage and the HTTP 400 boundary — but it is not treated as the boundary
of the reusable API.

The branch already carried in-progress work on the same package. That work was
re-verified rather than accepted: the tree was read in full, 127 tests passed
before any edit, and each new claim below was reproduced with an executable probe
against the package source before a repair was written.

Evidence classes follow the repository convention: **R** reproduced defect,
**S** code-path inference, **C** contract risk, **A** architectural proposal.

## Findings and disposition

| ID | Class | Finding | Location | Disposition |
|---|---|---|---|---|
| Z-01 | R | A request whose type carries no schema surface crashed the behavior with `TypeError: Cannot read properties of undefined (reading '_zodSchema')` instead of passing through. `PipelineContext` derives `requestType` from `request.constructor`, which is `undefined` for a null-prototype request. | `zod-validation.behavior.ts` | Fixed — the schema lookup is guarded and the behavior is a no-op, matching its documented "no schema attached" contract. |
| Z-02 | R | Instance fields declared on a subclass of a generated request were deleted by the behavior, and their presence also forced a full re-parse. `baseKeys` was captured inside the generated base constructor, which runs before derived-class field initializers. | `create-zod-request.ts`, `zod-validation.behavior.ts` | Fixed — validation state now tracks the keys the schema itself produced, so class-owned fields are neither compared nor removed. |
| Z-03 | R | Changing any field outside the schema marked the request mutated and re-ran the schema over its own *parsed* payload. For a schema whose output type differs from its input type this raised a spurious `ZodValidationError` — probe: `z.object({ n: z.string().transform(v => v.length), other: z.number() })` rejected a valid request with `expected string, received number` after `other` changed. | `zod-data.helpers.ts`, `zod-validation.behavior.ts` | Repaired at the common trigger (Z-02's key tracking). The residual case — mutating a schema-owned field of a non-input/output-stable schema — is inherent to re-parsing and is now documented in the README instead of being left implicit. |
| Z-04 | R | Cloning and comparing binary payloads did per-index property work over typed-array elements. A 200 KB `Uint8Array` cost ~306 ms (116 ms clone, 190 ms compare) on every behavior pass. | `zod-data.helpers.ts` | Fixed — binary values copy and compare wholesale. Same payload now ~2 ms. Covered by a bounded regression assertion. |
| Z-05 | C | The README described a key-removal rule the code did not implement, omitted `getRawInput`, `getValidatedData`, `parseAsync`, `ZOD_RAW_INPUT_KEY` and `ZOD_VALIDATED_DATA_KEY` from the API reference, and named a non-existent `createRequest()` export. | `README.md` | Fixed — "How It Works" now matches the implementation, the removal rule and the re-parse caveat are stated, and the missing public surface is documented. |
| Z-06 | C | `README.md` carried a "Property-presence correction" section written as change history ("Earlier constructors dropped..."), which `AGENTS.md` forbids in a current-state manual, plus decorative `// ── ... ──` dividers inside a code block. | `README.md` | Fixed — rewritten as a current-state "Property presence" statement; dividers removed. |
| Z-07 | C | A spec `describe` title embedded a task identifier (`(Item 12)`), against `AGENTS.md` rule 21. | `zod-validation.behavior.spec.ts` | Fixed — the title now names the behavior only. |

## Observable contract changes

Both follow from Z-02 and are deliberate; neither removes a supported feature.

- `getValidatedData()` returns exactly the schema-produced payload. Base-class and
  subclass fields no longer appear in it, because they were never validated data.
  No consumer in this repository reads them from it.
- A key added to an already-parsed request by another behavior survives a later
  re-parse instead of being deleted. Stripping still applies in full on the first
  parse of a request the behavior has not seen — a plain object or a hand-written
  class carrying `_zodSchema` — which is the path where untrusted input actually
  arrives. Covered by a regression test.

## Contract decisions retained

Evaluated for removal or simplification and deliberately kept:

- Rich payload support in the snapshot: `Map`, `Set`, `Date` (including attached
  data), `RegExp` (including `lastIndex`), typed arrays, `ArrayBuffer`, `Buffer`,
  cycles and shared references. A JSON round-trip would be smaller but would
  silently corrupt every transform that produces one of these.
- Legacy symbol metadata (`ZOD_RAW_INPUT_KEY`, `ZOD_VALIDATED_DATA_KEY`) stays
  readable for requests built outside this package, and still does not establish
  a trusted validation result — a caller cannot attach it to skip validation.
- `getValidatedData()` returns a fresh frozen copy per call, so an inspecting
  caller cannot reach the state the behavior trusts.
- `parseAsync()`, optional base classes, Standard Schema (`~standard`) forwarding,
  static `parse()` / `safeParse()`, `requestKind` tagging, the plain-object output
  assertion, `ZodPipe` and `ZodValidationFilter` are unchanged.

## Simplification and maintenance

- Validation state dropped from three fields to two (`{ schema, snapshot }`); the
  snapshot is the parsed payload itself rather than a filtered copy of the live
  instance. The `baseKeys` computation left the generated constructor entirely.
- `hasBeenMutated` is a single predicate over the snapshot's keys; the separate
  length comparison and the missing-key branch collapsed into it.
- `enumerableKeys` no longer allocates a property descriptor per string key.
- Cycle detection in `deepEqual` uses one bidirectional `Map` instead of spreading
  the ancestor values into an array at every object node.
- Binary values are a terminal case in both clone and compare, which removed two
  redundant traversals as well as the cost in Z-04.

## Residual risks

- Re-parsing a mutated request runs the schema over parsed output. For a schema
  that is not input/output-stable this can fail legitimately (Z-03). Detecting it
  would require partial revalidation, which Zod does not offer; the README now
  tells consumers to build a new request instead of mutating a parsed one.
- Structural equality treats a class instance as equal to a plain object carrying
  the same enumerable fields. Opaque built-ins keep their brand, so values such as
  `URL` still force revalidation; a domain class whose whole state is enumerable
  is compared by that state.
- `ddd/users-api/test/behaviors.spec.ts` retains decorative banner comments from
  earlier work. Left untouched as unrelated to this review.

## Verification

Commands run on this tree, all passing:

- `pnpm --filter @nestjs-pipeline/zod test` — 13 files, 131 tests (127 at baseline;
  4 added for Z-01, Z-02, Z-03 and Z-04, plus the retained first-parse stripping rule).
- `pnpm --filter @nestjs-pipeline/ddd-users-api test` — 97 files, 522 tests, including
  a new case asserting a generated `UpdateUserCommand` survives repeated pipeline
  passes with its non-enumerable `sessionUser` and `getUpdateFields` intact.
- `pnpm test` — every workspace: 216 files, 2016 tests.
- `pnpm test:e2e` — 28 files, 139 tests.
- `pnpm lint` — `tsc --noEmit` across all workspaces.
- `pnpm check` and `pnpm lint:persistence` — 664 files, zero diagnostics.
- `pnpm test:release` — 12 packed packages, core lifecycle, CASL 7.
- `pnpm context:update` and `pnpm context:validate` — the map regenerated to file
  counts only; no manual section was invalidated.
