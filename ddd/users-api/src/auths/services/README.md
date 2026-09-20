# Authentication application services

Authentication services may reuse query-side repository ports for data they need while executing a command, but they must not dispatch a nested `QueryBus` request from inside that command flow.

`UserLoginService` loads the user through the `EXT_USER_QUERY_REPOSITORY.getUser` port and issues the token through `IAccessTokenIssuer`. Permissions are not part of the token; `CaslPermissionSource` reads them per request.

This keeps the command execution graph explicit: `CreateAuthCommand` remains one command pipeline, and its data loading is an application dependency rather than a second CQRS pipeline hidden inside it. The rule does not prohibit top-level queries or sharing a query repository between command-side orchestration and query handlers.
