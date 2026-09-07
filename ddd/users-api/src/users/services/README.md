# User application services

`CaslUserContextResolver` owns principal/session resolution policy for CASL. It is a singleton application service because request data arrives through `IPipelineContext` and the session AsyncLocalStorage store; it does not require Nest request scope.

Database lookup is delegated through `GetUserContextQuery`. The corresponding `GetUserContextQueryRepository` remains a persistence-only read adapter and must not parse request/session data or implement `IUserContextResolver`.

Authorization classifies principals with the explicit `principalType` supplied by the authentication boundary:

- `user` — must resolve to an active persisted user through `GetUserContextQuery`;
- `service` — may use explicit service capabilities without a user-row lookup.

Never infer principal type from UUID syntax, prefixes, string length, or another identifier-format heuristic. A UUID-looking service id remains a service; a human-readable user id remains a user.
