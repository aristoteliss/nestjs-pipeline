# Pipeline constants and private Nest APIs

The pipeline does not read Nest CQRS decorator metadata constants directly. Handler discovery is performed by the existing bootstrap integration around `ExplorerService`; therefore a re-export of `@nestjs/cqrs/dist/decorators/constants` is dead coupling and must not be reintroduced.

This rule is intentionally narrow. The repository still accepts the documented `ExplorerService` / `InstanceWrapper` private-API coupling needed for scoped pipeline runner bootstrap. Architecture finding #14 remains an accepted technical risk and is not changed by removing unused metadata constants.

`private-api-boundary.spec.ts` guards against reintroducing the dead decorator-constants dependency. The users-api E2E smoke test verifies real CQRS handler discovery and dispatch continue to work without that module.
