# Authentication principal types

`SessionUser.principalType` is the explicit identity discriminator used by authorization.

- `user` means the principal must resolve to a current persisted `User` before CASL authorization can proceed.
- `service` means a non-database machine principal and is accepted only with explicit capabilities.

Authorization must never infer this distinction from the syntax of `SessionUser.id`. UUID-looking service IDs are valid service principals, while human-readable user IDs remain database-user identities when explicitly classified as `user`.

The field remains optional on the transport type only so stale serialized sessions can be deserialized safely. The authorization resolver rejects principals that do not carry an explicit `principalType`; authentication producers are responsible for setting it.
