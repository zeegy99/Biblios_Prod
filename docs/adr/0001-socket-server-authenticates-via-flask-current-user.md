# Socket server identifies players by asking Flask, not by JWT or its own DB access

The Node socket server needs to know who is behind each connection. We keep the existing opaque Session (`sessions` table + `sid` cookie) rather than switching to JWTs, and when a socket connects the socket server forwards the `sid` cookie to Flask's `/api/current-user` instead of opening its own Postgres connection. Flask stays the single owner of auth and the user database; the socket server only ever sees a resolved Player Identity.

## Consequences

- If Flask is unreachable or errors during the connection check, the connection is treated as a Guest rather than refused, so a Flask outage doesn't block play.
- Guests are identified by a server-issued Guest Token held in the socket server's memory; Guest identities do not survive a socket server restart.
