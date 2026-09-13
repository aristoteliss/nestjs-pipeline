Perform an exhaustive, repository-wide code review of the nestjs-pipeline repository.

I want this to be a deep review at every level of the codebase — not a superficial scan and not just a list of obvious linting or style issues.

Review everything that materially affects the quality, maintainability, architecture, correctness, and long-term evolution of the repository.

Before evaluating the code, make sure you fully understand the repository and its intended architecture.

Start by reading:

Every relevant SKILL.md

Every AGENTS.md

All README.md files

Architecture documentation

Design decisions

Package-level documentation

Examples and usage documentation

Any other Markdown files that describe assumptions, constraints, conventions, architectural decisions, or intentional trade-offs

Treat those documents as part of the specification of the project.

Do not report an intentional architectural decision or explicitly documented trade-off as a defect simply because another architecture could theoretically be considered "cleaner". First understand why the decision exists, then evaluate whether its implementation is consistent with that decision and whether there is a better way to achieve the same goal.

Scope of the review

Inspect the entire repository for architectural, structural, implementation, API-design, abstraction, maintainability, testing, and code-quality problems.

In particular, aggressively look for signs of AI-generated slop or code that appears correct locally but does not represent a deliberate, coherent engineering solution.

Examples include, but are not limited to:

Code duplicated in multiple locations

Near-duplicate implementations with only minor differences

Similar abstractions that should probably be unified

Repeated patterns that should have a shared implementation

Copy-pasted code with slightly modified names

Unnecessary wrappers

Unnecessary indirection

Abstractions that add complexity without providing meaningful value

Over-engineering

Premature generalization

Excessive generic types or type-level complexity without real benefit

Large amounts of boilerplate hiding relatively simple behavior

Shortcuts or temporary workarounds being used instead of proper solutions

Special cases added to avoid fixing the underlying design

Functions/classes/modules that do too many unrelated things

Components that exist only because of historical implementation details

Dead abstractions

Dead code

Unused extension points

APIs that expose implementation details

Inconsistent naming or concepts representing the same thing

Multiple ways of accomplishing the same operation without a strong reason

Hidden coupling between packages

Circular conceptual dependencies

Leaky abstractions

Infrastructure concerns leaking into domain or application code

Framework-specific concepts leaking into places where they should not exist

Excessive NestJS coupling

Excessive CQRS coupling

Configuration or dependency-injection tricks that make the design harder to reason about

Runtime complexity introduced only to support an abstraction that could be simpler

Code that is technically reusable but practically difficult to understand or maintain

"Clever" solutions where a straightforward implementation would be safer

Defensive code that exists because the underlying contracts are poorly defined

Comments or documentation trying to justify complexity that could instead be removed

Inconsistent error handling

Weak boundaries between packages or architectural layers

Missing invariants

Weak domain modeling

Anemic domain models where behavior belongs inside the domain

Application services containing domain rules that should belong elsewhere

Domain objects depending on infrastructure/framework concerns

Repository abstractions that expose persistence details

DTOs leaking across architectural boundaries

Commands, queries, handlers, aggregates, entities, value objects, repositories, domain services, and application services being used in ways inconsistent with their architectural purpose

Do not limit yourself to this list. Use engineering judgment and actively search for other structural problems.

DDD, Clean Architecture, and CQRS review

The most important part of the review is to determine where the codebase diverges from the principles it claims to follow.

Evaluate the repository specifically against:

Domain-Driven Design

Clean Architecture

CQRS

Dependency inversion

Separation of concerns

Explicit architectural boundaries

Correct ownership of business rules

Framework independence where appropriate

Infrastructure isolation

Domain isolation

Application-layer responsibilities

Proper dependency direction

For every meaningful violation, explain:

Where it occurs

What exactly is wrong

Which architectural principle it violates

Why it matters in practice

What problems it may create as the project grows

How it should be redesigned

What the resulting dependency direction should look like

Which files/classes/interfaces/modules would need to change

However, distinguish carefully between:

A genuine architectural violation

A pragmatic trade-off

An explicitly documented repository decision

A limitation imposed by NestJS or another dependency

A temporary implementation choice

A deliberate simplification

If something is documented as an intentional assumption or compromise, do not simply list it as "wrong".

Instead:

Explain the trade-off

Evaluate whether it is implemented consistently

Identify the cost it introduces

Determine whether that cost is acceptable

Suggest a better alternative only if it preserves the original intent

Review the abstractions themselves

Do not assume that an abstraction is good simply because it is reusable.

For each major abstraction, ask:

What problem is this solving?

Is the problem real and recurring?

Is the abstraction simpler than the code it replaces?

Does it reduce duplication or merely move complexity elsewhere?

Is the API understandable without reading its implementation?

Is the abstraction at the correct architectural layer?

Does it introduce unnecessary coupling?

Does it make debugging harder?

Does it constrain future changes?

Could the same result be achieved with a smaller and more explicit design?

Pay particular attention to the abstractions built around NestJS CQRS, decorators, pipelines, middleware-like behavior, handlers, DDD infrastructure, and reusable packages.

Cross-package analysis

Do not review packages in isolation.

Look across the entire repository for:

duplicated concepts implemented differently

abstractions that overlap

packages solving the same problem at different layers

inconsistent conventions

unnecessary package boundaries

missing package boundaries

dependency-direction violations

utilities that should belong to a shared lower-level package

domain-specific concepts accidentally placed in reusable packages

supposedly generic packages that are actually coupled to one concrete use case

Analyze whether each package has a clear reason to exist.

Tests

Review the test architecture as well.

Look for:

missing behavioral tests

tests coupled too closely to implementation details

excessive mocks

meaningless tests

duplicated test setup

tests that simply mirror the implementation

important architectural contracts that are not tested

integration boundaries that should have tests

false confidence caused by high test counts but weak assertions

difficult-to-test code caused by poor architecture

Where appropriate, recommend what type of test should replace or complement the existing test.

Final deliverable

At the end, produce a detailed review document.

This must not be a generic list of recommendations.

For every finding, include enough information that another engineer could implement the change without having to rediscover the problem.

For each issue include, where applicable:

Severity

Category

Package

File or files involved

Relevant class/function/interface/module

Current behavior/design

Why it is problematic

Architectural impact

Concrete proposed solution

Exact refactoring direction

Dependencies affected

API changes, if any

Migration considerations

Tests that must be added or changed

Risks introduced by the refactor

Expected benefit

Whether the change is mandatory, strongly recommended, or optional

When possible, provide concrete examples of the target structure or API instead of vague advice such as "refactor this", "improve separation of concerns", or "use cleaner architecture".

The report should be detailed enough to serve as an implementation blueprint for improving the repository.

Prioritize findings so that foundational architectural problems are addressed before cosmetic improvements.

Also identify cases where several individual problems share the same root cause. Prefer fixing the root architectural problem rather than proposing ten local patches.

Architecture improvement section

Add a separate section dedicated to improving the existing architecture, even where the current implementation is not technically incorrect.

The goal is not to redesign the project from scratch.

Preserve the philosophy and goals of the repository, but identify ways to make the architecture:

simpler

more explicit

easier to understand

easier to extend

easier to test

harder to misuse

less dependent on framework-specific behavior

less coupled to specific libraries

more reusable where reuse is actually valuable

Most importantly, revisit the architectural assumptions and trade-offs documented in the Markdown files.

Where an existing assumption currently forces the project to depend on NestJS, @nestjs/cqrs, decorators, reflection, dependency injection behavior, persistence mechanisms, or other concrete technologies, investigate whether the same capability could be expressed through a more technology-agnostic contract.

For each such opportunity, explain:

What the current dependency is

Why it currently exists

Which repository assumption led to it

Whether the dependency is essential or incidental

What an agnostic abstraction could look like

Where the framework-specific adapter would live

How the rest of the system would interact with it

Whether this actually improves the architecture or merely adds another abstraction

Do not pursue framework independence blindly.

If making something agnostic would create significantly more complexity than value, say so explicitly and recommend keeping the existing dependency.

The objective is to discover places where the core architecture can become more independent without turning the repository into an abstraction-heavy framework of its own.

Review standard

Be critical.

Do not assume that existing code is correct simply because it compiles, has tests, follows common NestJS conventions, or appears sophisticated.

At the same time, do not manufacture issues simply to make the review longer.

Prefer a smaller number of deeply justified findings over a large number of weak stylistic observations.

For each recommendation, ask:

Does this make the repository genuinely simpler, more coherent, more maintainable, or more architecturally correct?

If the answer is no, do not recommend the change.

The final result should give me a clear picture of:

what is genuinely wrong

what is merely imperfect

what is intentionally designed that way

what should be simplified

what should be unified

what should be removed

what should be redesigned

what architectural decisions should remain untouched

and how the repository could evolve into a stronger implementation of DDD, Clean Architecture, and CQRS without losing its original purpose.