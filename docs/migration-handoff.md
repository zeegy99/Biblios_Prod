# Server-authoritative Games: migration handoff (#46)

Status of the slices in #46, the decisions made along the way that still need the developer's sign-off, and what to check before release. Each slice was built test-first by one agent and then checked by a separate review agent. Its fixes landed as a follow-up `(#n review)` commit.

## Slices

| Issue | Slice | Commits | State |
|---|---|---|---|
| #47 | Walking skeleton | 3820d96, 17d1b7e | closed |
| #48 | Donation Moves | e9dbef0, cf510f4 | done, issue still open |
| #49 | Special / dice-modification cards | 29cd2da, 6869cf2 | done |
| #50 | Shared selection | 4a928ed, b877d58 | done |
| #51 | Auction bidding | 63111c6, 677eb2a | done |
| #52 | Auction payment | 04b9276, 3ee8f9f | done |
| #53 | Scoring, end of Game, Elo via Flask | 88b1868, 68ede2b, bd0d0d4, 6b6e58d | done |
| #54 | Rejoin | 09cd704, 0ca0609 | done |
| #56 | Engine crash recovery | 1f4b8c3, f30d5a1 | done |
| #55 | Turn deadlines, abandoned Games | 143abe6, 7bd86c7, 2ea18b1 | done |
| #57 | Cutover | 448decb, 923c25c, acf113f, 264382c, 3542aab | done |

Nothing has been pushed, and no issue has been closed or commented on. Every slice's acceptance criteria are met, so #46 and #48–#57 can be closed once the manual checks below pass.

Test state at handoff: 143 engine + unit pytest tests, 28 Flask integration tests (run against a throwaway Postgres), and 62 jest tests, all passing. jest passed on 3 consecutive runs, and the Vite build succeeds.

## Rule decisions to confirm

The commit bodies give the full reasoning for each.

1. **Tie-break in scoring (#53):** a tie on a die goes to the lowest `tieBreaker` letter among that resource's cards. React's scoring read `card.tie_breaker`, which no card has, so React always split ties. This is a deliberate exception to "matches React".
2. **Exact ties (#53):** Seats tied on both points and gold get different ranks in Seat order, and so different Elo, as React's stable sort does. Split points can be fractional, as in React.
3. **Auction starter (#51):** Seat 0 bids first on the first card, and the starting Seat rotates by one per card, which is what React actually does. React's `auctionStarterIndex` (last donor + 1) was passed around but never used.
4. **Special cards are face up (#49):** every Seat sees the special card being played, the chosen direction and each die change as it happens. React only showed this to the donor and sent the dice once the card was finished.
5. **Payment visibility (#52):** the cards given up for a won Gold card are public, as React's chat message made them. For a gold payment, only the amount is public.
6. **Short draw (#48–#50):** when a donation draw runs out of ordinary cards, the Game goes to the auction. The cards drawn and any specials drawn that turn are dropped, as in React.
7. **Deadlines (#55, chosen by the developer):** every step has a default Move.
   - Donation: the first legal of keep / discard / donate.
   - Special card: the first legal direction, then the first legal die.
   - Shared selection: a random card, from the Game's seeded RNG.
   - Bid: pass.
   - Payment: the cheapest valid payment.

   Durations are 30 s for donation, specials and payment, and 10 s for shared selection and bids. Each accepted Move restarts the clock, so a donor gets 30 s per card. Deadlines pause while every Seat is disconnected, so an abandoned Game can't finish and record Elo.
8. **Guests:** a Guest who refreshes loses their Seat, which carries on with default Moves. A Guest can't Rejoin until Guest Tokens exist (slice 11 / #14).

## Deployment

- Set `GAME_RESULT_SECRET` to the same value on the Node service and on Flask. Without it, Node reports nothing and Flask refuses with 503. Node posts to `AUTH_URL` + `/api/internal/game_result`, so `AUTH_URL` should be https in production.
- Run `server/schema.sql` against production Postgres to create the `game_results` table. It is safe to re-run.
- The Node service needs a Python interpreter (`ENGINE_PYTHON`, default `python3`, or `python` on Windows) and must run with `server/` as its working directory. Flask imports `engine.game` for the Elo formula, so it must also run from `server/`.
- Games live only in memory (ADR-0002), so a deploy ends every Game in progress.

## Server limits added in #57

- Only the host (the first listed player) can start a Game.
- A Game needs at least 2 players.
- A start is refused while a Game is in progress or being started in the Room.
- Deck settings are capped at 20 cards per value.

## Manual checks (two browsers; every Room now plays with server rules)

No React screen has automated tests, and none of the server-rules screens has been played in a browser yet.

1. Play a full Game: donation, a special card, shared selection, the auction with both a gold payment and a card payment, then the results. Check Elo on the leaderboard.
2. Refresh mid-donation as a Signed-in Player: you get the same view and only your own hand. The other player sees "Disconnected", which clears when you're back.
3. Close a tab, then reopen `/game/<room>`: you get your Seat back. A third account opening the same URL gets "no Seat".
4. Refresh on the results screen: the results come back.
5. Leave a player idle: the default Moves play and the countdown matches.
6. Kill the engine process mid-Game: every player gets "Game was lost" and goes back to the lobby, and a new Game starts.
7. A non-host sees no Start button, and a refused start shows the lobby alert.
8. A Guest who refreshes mid-Game sees "You have no Seat…" with a "Back to the lobby" button.

## Gaps and known issues

- **Keybinds:** the server-rules screens don't support them, but the settings page still edits them. Either port the keybinds or remove that UI.
- **Dropped with the old screens:** the remote cursor, the card-flip and clock sounds, and the "X modified the dice…" chat line.
- **README rules text** still says category ties are split evenly. Update it once decision 1 is confirmed.
- **#15:** `leave_game` still removes Room-list entries by a `playerId` taken from the payload.
- `update_deck_settings` is accepted from anyone in the Room. It only stores the value; the host's `start_game` payload is what builds the deck.
- The client countdown uses the client's own clock, so clock skew shows.
- **#34:** tracked `__pycache__` files still show up as modified after test runs.
