# Authentication application services

Authentication services may reuse query-side repository ports for data they need while executing a command, but they must not dispatch a nested `QueryBus` request from inside that command flow.

`UserLoginService.signToken()` resolves `UserCapabilities` through `QUERY_REPOSITORY.getUserCapabilities`. The standalone `GetUserCapabilitiesQuery` handler uses the same repository port when the capability lookup is invoked as a top-level CQRS query.

This keeps the command execution graph explicit: `CreateAuthCommand` remains one command pipeline, while capability loading is an application dependency rather than a second CQRS pipeline hidden inside it. The rule does not prohibit top-level queries or sharing a query repository between command-side orchestration and query handlers.
