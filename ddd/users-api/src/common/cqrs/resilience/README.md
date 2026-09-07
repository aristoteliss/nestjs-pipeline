# CQRS resilience policy

Application handlers may select retryable failures through neutral technical metadata, but they must not import classifiers from `src/persistence` or concrete ORM adapters.

`isTransientTechnicalError()` recognizes retryable database/network classes using generic `code`, `name`, and nested `cause` fields. It deliberately has no dependency on Nest HTTP exceptions or MikroORM types. Deterministic domain, authorization, validation, and not-found failures therefore remain outside the retry path unless they explicitly carry a known transient technical code.

Keep retry policy separate from persistence implementation details. If a new infrastructure provider introduces a transient code that should be globally retryable, add the code and regression coverage here rather than importing the provider into an application handler.
