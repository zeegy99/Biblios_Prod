# Biblios

An online multiplayer version of the Biblios card game: players gather in rooms, play a game together, and signed-in players earn Elo.

## Language

### Identity

**Player Identity**:
The server-assigned, stable identifier for whoever is behind a connection; either a Signed-in Player's or a Guest's. Never chosen by the client.
_Avoid_: playerId (the old client-generated value), socket id, user

**Signed-in Player**:
A player whose connection carries a valid Session; their Player Identity is derived from their account.
_Avoid_: logged-in user, member

**Guest**:
A player who is not signed in through Biblios sign-in (no Session, or an expired/invalid one). Guests can play.
_Avoid_: anonymous user, visitor

**Guest Token**:
A random secret the server issues to a Guest so the same Guest is recognized after a refresh or reconnect.
_Avoid_: guest id (the token is the secret; the Player Identity is the id)

**Session**:
A row in the `sessions` table created at sign-in, referenced by the `sid` cookie. It is an opaque token, not a JWT. A Session expires a fixed 7 days after sign-in (no renewal). An account may hold several Sessions at once, one per sign-in. The Session is the only source of truth for whether a player is signed in and who they are.
_Avoid_: JWT, cookie table, auth token

**Sign-out**:
Ending the current Session: its row is deleted and the `sid` cookie cleared. Other Sessions of the same account are untouched.
_Avoid_: logout (fine colloquially), clearing local storage

**Display Name**:
The name shown to other players in a Room. A Signed-in Player's defaults to their account username but may be changed; it never identifies anyone.
_Avoid_: alias, playerName (as an identity), username (unless you mean the account's)

### Rooms

**Room**:
A named lobby that players join, identified by a room code, in which one game is played.
_Avoid_: lobby (for the identifier), match

**Rejoin**:
A player with an existing seat in a Room reconnecting and getting the current game state back.
_Avoid_: reconnect (for the game-level action)
