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

### Games

**Game**:
One play-through of Biblios inside a Room. The server holds the true state of every Game, including all randomness (shuffles, dice); clients never decide the state, they only propose Moves.
_Avoid_: match, game state blob, sync

**Move**:
A player's request to change a Game, expressed as an intent (e.g. donate this card, bid 4, pass). The server either applies it or rejects it as illegal; a rejected Move changes nothing.
_Avoid_: action, sync, state update

**Seat**:
A player's fixed place in a Game, bound to their Player Identity when the Game starts. Disconnecting never frees a Seat; the same Player Identity can always Rejoin it.
_Avoid_: slot, player index, socket

**Elo**:
The rank-based rating Signed-in Players earn from finished Games: placings are worth a fixed step per place above or below the median. Guests take placings (so they affect Signed-in Players' changes) but have no Elo themselves. A Game's result is recorded at most once. (Not the classical Elo formula, despite the name.)
_Avoid_: score, points (those are in-game)

**Player View**:
What one seat is allowed to see of a Game: the shared/public parts plus their own hand, with other players' hands and the deck order hidden. The server only ever sends Player Views, never the full Game.
_Avoid_: game state (when you mean what a client receives)

**Rejoin**:
A player with an existing seat in a Room reconnecting and getting their current Player View back from the server.
_Avoid_: reconnect (for the game-level action)
