# Presentation error mapping

Domain and application code in this example API stays transport-neutral. Missing aggregates are represented by `EntityNotFoundException` from `@nestjs-pipeline/ddd-core/domain`; command handlers and persistence repositories must not import Nest `NotFoundException` to express that outcome.

`DomainExceptionFilter` is the HTTP presentation boundary. It maps this application's own exceptions (unique email or role name 409, invalid username, department or role name 422, login and refresh-token failures 401, auth misconfiguration 500) and takes the status for every other `DomainException` from `domainErrorHttpStatus()` in `@nestjs-pipeline/ddd-core/http`: 409 `ConcurrencyConflictError`, 404 `EntityNotFoundException` (keeping the `"User not found"` / `"Role not found"` messages), a generic 500 for `MissingTenantContextError`, and 400 otherwise. Other transports may map the same exceptions differently without changing application code.

Presentation-only code such as HTTP DTO response mappers may still use Nest HTTP exceptions where they are genuinely part of the adapter contract. The restriction applies to inward domain/application/persistence layers, not to the transport boundary itself.

Regression coverage is split intentionally: command/repository unit specs assert the framework-neutral exception type, the filter unit specs assert the status mapping, and `test/not-found-boundary.e2e-spec.ts` and `test/missing-tenant-boundary.e2e-spec.ts` verify the externally observable HTTP behavior through the real application composition.
