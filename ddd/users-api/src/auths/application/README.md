# Authentication application boundary

`UserLoginService` is application orchestration only. It may coordinate user lookup and capability resolution, but it must not read environment variables, sign/verify JWTs, call crypto APIs, or depend on the concrete persistence tenant context.

- `ILoginCodeVerifier` owns credential-code verification. The demo implementation is `EnvLoginCodeVerifier`.
- `IAccessTokenIssuer` owns access-token materialization. The default implementation is `JoseAccessTokenIssuer`.
- Infrastructure adapters translate configuration problems into framework-neutral `AuthConfigurationException` and credential failures into `InvalidLoginCredentialsException`.
- The HTTP layer maps those application/domain failures to status codes through `DomainExceptionFilter`.

The temporary `QueryBus` capability lookup in `UserLoginService.signToken()` is a separate CQRS architecture concern and must not be conflated with this boundary refactor.
