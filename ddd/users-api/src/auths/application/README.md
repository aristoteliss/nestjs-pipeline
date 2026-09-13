# Authentication application boundary

`UserLoginService` is application orchestration only. It resolves users and capabilities through query-repository ports, verifies the presented login credential through `LOGIN_CODE_VERIFIER`, and delegates token creation to `ACCESS_TOKEN_ISSUER`. It must not read environment variables, call `jose`/`node:crypto`, depend on a concrete persistence tenant context, or throw Nest HTTP exceptions.

The sample application provides two infrastructure adapters. `EnvLoginCodeVerifier` prefers `AUTH_LOGIN_CODE_SHA256` and performs fixed-length SHA-256 digest comparison with `timingSafeEqual`; plaintext `AUTH_LOGIN_CODE` exists only as non-production demo compatibility and is rejected in production. `JoseAccessTokenIssuer` owns environment/JWT/tenant-specific token materialization.

Authentication failures are framework-neutral `DomainException` types. `DomainExceptionFilter` is the HTTP presentation boundary that maps invalid credentials to 401 and invalid server authentication configuration to 500.

Capability loading remains a direct repository-port call rather than a nested `QueryBus` dispatch, preserving the CQRS boundary established by architecture finding #4.
