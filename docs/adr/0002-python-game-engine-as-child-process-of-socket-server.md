# The authoritative Game engine is Python, run as a child process of the Node socket server

The server must hold the true state of every Game and accept or reject each Move. We write the rules engine in Python (ported from the React components, which are the canonical rules) so the future RL bot can import the very same engine for training instead of maintaining a second copy of the rules. The Node socket server keeps Rooms, sockets and Session checks (ADR-0001), spawns the engine as a child process, and exchanges JSON messages with it: Moves in, Player Views out. Clients no longer contain game rules; they only render Player Views.

We rejected putting the engine inside Flask (Games in memory would split across gunicorn workers and make the auth service stateful), replacing Node with a Python socket server (would redo the Session gate work), a separate long-running Python service (a third thing to deploy for no gain while Games live in memory), and keeping the engine in JS (the bot would need its own copy of the rules).

## Consequences

- Games live only in the engine process's memory: a restart of the socket server (e.g. every deploy) loses Games in progress.
- Every Move crosses a process boundary; this is cheap compared with the network hop from the client.
