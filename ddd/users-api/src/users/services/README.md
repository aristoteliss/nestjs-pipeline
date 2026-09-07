# User application services

`CaslUserContextResolver` owns principal/session resolution policy for CASL. It is a singleton application service because request data arrives through `IPipelineContext` and the session AsyncLocalStorage store; it does not require Nest request scope.

Database lookup is delegated through `GetUserContextQuery`. The corresponding `GetUserContextQueryRepository` remains a persistence-only read adapter and must not parse request/session data or implement `IUserContextResolver`.

The UUID-based user-vs-machine compatibility rule is intentionally isolated in the resolver until Architecture.md finding #9 replaces it with an explicit principal discriminator.
