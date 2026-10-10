# Make Sessions Actually Work PRD

## Problem

Signing in creates a Session (a `sessions` row plus the `sid` cookie), but almost nothing uses it:

- Only `/api/current-user` reads the Session. `/api/update_elo` and `/api/send_keybinds` trust a username sent in the request body, so any client can change any account's Elo or keybinds.
- Sign Out runs `localStorage.clear()` and nothing else. The Session row and the `sid` cookie survive, so the player is still signed in as far as the server is concerned.
- The frontend decides who the player is from `localStorage` (`isGuest`, `signin_username`, `playerName`) instead of from the Session. `signin_username` is read in several components but never written.
- The socket resolves the Session only during the handshake (ADR-0001). The socket connects when the page loads, which is before sign-in, so a player who signs in without refreshing stays a Guest on the socket.

## Goals & success metrics

- Every write that is tied to an account takes the account from the Session. Sending someone else's username in the body has no effect.
- After Sign-out, `/api/current-user` returns 401 and that Session's row is gone.
- The frontend's answer to "am I signed in, and as whom?" comes only from the Session.
- After sign-in or Sign-out, the socket's Player Identity matches the Session without a page refresh.

## Non-goals

- Having the server compute Elo changes. The client still reports `eloChange`; only *whose* Elo changes is fixed here. Follow-up issue.
- Rejoin keyed on Player Identity. Follow-up issue.
- Guest Token. Follow-up issue.
- Migrating `elo` and `keybinds` from `username` to `user_id`. Follow-up issue.
- Identifying the local player in the scoring phase by Player Identity instead of Display Name. Follow-up issue.
- Sliding Session expiry or a grace period.
- Removing non-identity data from `localStorage` (Display Name, `roomCode`/`prevRoomCode`, Volume, `start_game_payload`).

## Users & user stories

- As a Signed-in Player, I want my Elo updated only by my own games so that nobody else can change my rating.
- As a Signed-in Player, I want Sign-out to really sign me out on this device so that the next person at the computer isn't playing as me.
- As a Signed-in Player on two devices, I want signing out on one to leave the other signed in.
- As a player who just signed in, I want the game server to recognise me straight away, without refreshing the page.
- As a Signed-in Player, I want to pick a Display Name that's different from my username without it changing who I am.
- As a Signed-in Player whose Session expired mid-game, I want to be told that my Elo wasn't recorded, so the loss of the change isn't silent.

## Requirements

### Functional

**Flask**

1. `POST /api/update_elo` reads the username from the Session behind the `sid` cookie. It ignores any `username` in the body and returns 401 when the Session is missing or expired.
2. `POST /api/send_keybinds` reads the username from the Session. It ignores any `name` in the body and returns 401 when the Session is missing or expired.
3. `POST /api/get_elo` and `GET /api/get_leaderboard` stay public lookups and need no Session.
4. A new `POST /api/signout` endpoint (handling `OPTIONS` like the other routes) deletes the `sessions` row for the request's `sid` and clears the `sid` cookie. It leaves the account's other Sessions alone, and it succeeds even when the Session is already missing or expired.
5. `POST /api/signin` deletes the account's expired `sessions` rows when it creates the new one.
6. Sessions keep a fixed 7-day lifetime with no renewal.

**Frontend**

7. A single auth provider (React context) calls `/api/current-user` when the app loads, after a sign-in succeeds, and after Sign-out. Components read sign-in state and username from the provider instead of fetching for themselves.
8. "Guest" means the provider has no user. The `isGuest` and `signin_username` keys are no longer read or written.
9. Every Sign Out button (`home_signedin`, `settings`, `leaderboard`, `forgot_password`, `reset_password`) calls the Sign-out endpoint, refreshes the provider, and no longer calls `localStorage.clear()`.
10. `update_elo` and `send_keybinds` requests send `credentials: 'include'` and no longer send a username.
11. If `update_elo` returns 401, the player sees a message that they are signed out and their Elo was not recorded.
12. Display Name can still be edited and stored in `localStorage`. It is never used as identity, except that the scoring phase still matches on it to find the local player (see Risks).
13. The dead `localStorage.getItem("playerId")` reads in `settings`, `leaderboard`, `reset_password` and `results` are removed.

**Socket**

14. After sign-in or Sign-out, the frontend disconnects and reconnects the socket so the handshake resolves the Session again. The socket server needs no changes for this.
15. Sign-in and Sign-out are offered only outside a Room.

### Non-functional

- A failed Flask call during the handshake still means "treat as Guest" and never refuses the connection (ADR-0001).
- New Flask behaviour gets tests in `server/tests_python` in the same style as the existing ones.

## Design / implementation notes

- Factor the Session lookup in `current_user()` (`server/app.py`) into a helper that returns `(user_id, username)` or `None`, and reuse it in `update_elo`, `send_keybinds` and the Sign-out endpoint.
- `elo` and `keybinds` stay keyed by `username`. That's safe because nothing ever updates `users.username`.
- Today `App.jsx`, `home_signedin.jsx`, `scoring_phase.jsx` and `sign_in.jsx` each fetch `/api/current-user` themselves. These fetches collapse into the provider.
- `frontend_/src/socket.js` exports one shared socket. The reconnect can be a call to `socket.disconnect().connect()` after the provider refreshes.
- The `sid` cookie is `httponly` and `SameSite=None; Secure` in production, so every request needs `credentials: 'include'`.

## Dependencies & constraints

- ADR-0001: Flask owns auth and the user database, and the socket server learns identity only through `/api/current-user`.
- Builds on #13, where the socket handshake already resolves the Session.

## Risks

- `scoring_phase.jsx` decides which player is "me" by comparing `player.name` with the stored `playerName`, which is the Display Name. Two players with the same Display Name could both post an Elo change, or neither could.
- Leftover `localStorage` keys from before this change (`isGuest`, `signin_username`) could linger in players' browsers. They become harmless once nothing reads them.

## Open questions

None remaining. Resolved:

- The scoring phase keeps identifying the local player by Display Name for now. Moving it to Player Identity is a follow-up issue.
- The Sign-out endpoint is `POST /api/signout` (with `OPTIONS`), mirroring `/api/signin`.
- The dead `localStorage.getItem("playerId")` reads in `settings`, `leaderboard`, `reset_password` and `results` are removed as part of this work.
