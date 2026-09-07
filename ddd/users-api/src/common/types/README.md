# Common authentication types

`SessionUser` carries an explicit `principalType` discriminator (`user` or `service`). Authorization code must use that discriminator instead of inferring principal identity from identifier syntax such as UUID shape.

Authentication producers are responsible for setting the discriminator: bearer/login principals are `user`; API-client principals are `service`. The field remains optional at the transport type boundary for stale-session deserialization, but authorization resolvers fail closed when it is missing.

A `user` principal is always checked against persistence, regardless of whether its id looks like a UUID. A `service` principal is never reclassified as a database user, even when its id is UUID-shaped.
