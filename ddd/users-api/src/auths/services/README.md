# Authentication services

`JwtAuthenticator` treats durable token revocation as part of the authentication contract, not as an optional enhancement.

A Bearer token is accepted only when both checks succeed:

1. cryptographic JWT verification and tenant/claim validation;
2. `QUERY_REPOSITORY.findAuth` confirms that the exact user/token pair still has an active persisted `Auth` record.

`QUERY_REPOSITORY.findAuth` is therefore a required constructor dependency. If the provider is missing, Nest application/module startup fails instead of silently disabling server-side revocation checks.

`AuthsModule` owns the binding to `FindAuthQueryRepository`. Tests that construct `JwtAuthenticator` directly must provide an explicit active/revoked repository stub so the intended revocation state is visible in the test.
