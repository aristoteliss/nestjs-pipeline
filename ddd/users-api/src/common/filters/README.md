# Presentation error mapping

Domain and application code in this example API stays transport-neutral. Missing aggregates are represented by `EntityNotFoundException` from `@nestjs-pipeline/ddd-core`; command handlers and persistence repositories must not import Nest `NotFoundException` to express that outcome.

`DomainExceptionFilter` is the HTTP presentation boundary. It maps `EntityNotFoundException` to `404 Not Found` while preserving the existing `"User not found"` / `"Role not found"` message contract. Other transports may map the same exception differently without changing application code.

Presentation-only code such as HTTP DTO response mappers may still use Nest HTTP exceptions where they are genuinely part of the adapter contract. The restriction applies to inward domain/application/persistence layers, not to the transport boundary itself.

Regression coverage is split intentionally: command/repository unit specs assert the framework-neutral exception type, the filter unit spec asserts 404 mapping, and `test/not-found-boundary.e2e-spec.ts` verifies the externally observable HTTP behavior through the real application composition.
