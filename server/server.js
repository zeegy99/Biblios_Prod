const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");

const crypto = require("crypto");
const { Server } = require("socket.io");
const { createEngineHost } = require("./engine_host");
const { createFlaskReporter } = require("./result_reporter");

const app = express();
app.use(cors());

const frontendPath = path.join(__dirname, "../frontend_/dist");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.send("Server is running");
});

const server = http.createServer(app);
// Per-Room state is keyed by client-chosen room codes, so it lives in objects
// without a prototype: a room called "constructor" or "__proto__" is just a key.
const deckSettingsInRoom = Object.create(null);
const allowedOrigins = process.env.NODE_ENV === "production"
  ? ["https://playbiblios.com"]
  : ["http://localhost:5173"];


const io = new Server(server, {
  cors: {
    origin: allowedOrigins, 
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;
const AUTH_URL = process.env.AUTH_URL || "http://localhost:5000";
const AUTH_TIMEOUT_MS = 3000;

// Asks Flask who owns the Session in this cookie header (ADR-0001).
// Returns { user_id, username } for a valid Session, otherwise null.
async function resolveSessionViaFlask(cookieHeader, authUrl = AUTH_URL) {
  const sid = /(?:^|;\s*)sid=([^;]*)/.exec(cookieHeader || "")?.[1];
  if (!sid) return null;
  try {
    const res = await fetch(`${authUrl}/api/current-user`, {
      headers: { cookie: `sid=${sid}` },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (res.status !== 200) return null;
    const { user_id, username } = await res.json();
    return { user_id, username };
  } catch (e) {
    return null;
  }
}

let resolveSession = resolveSessionViaFlask;

function setResolveSession(fn) {
  resolveSession = fn;
}

// Reports each finished Game to Flask, which applies Elo (see result_reporter.js).
const reportResultToFlask = createFlaskReporter({
  url: `${AUTH_URL}/api/internal/game_result`,
  secret: () => process.env.GAME_RESULT_SECRET,
});

let reportResult = reportResultToFlask;

function setReportResult(fn) {
  reportResult = fn;
}

// Never refuse a connection because of auth; unresolved connections are left without a player.
io.use(async (socket, next) => {
  try {
    const user = await resolveSession(socket.handshake.headers.cookie);
    if (user) {
      socket.data.player = { playerId: `user:${user.user_id}`, kind: "user", username: user.username };
    }
  } catch (e) {
    console.error("Session resolution failed:", e);
  }
  next();
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`Server listening on port ${PORT}`)
  });
}

// If the engine dies unexpectedly it is restarted and every Game it held is lost.
let engine = createEngineHost({ onCrash: () => loseAllGames() });

// Test hook, in the style of setResolveSession: replaces the engine host with
// `wrap(engine)` (e.g. to make one request fail) and returns a function that
// puts the previous one back.
function wrapEngine(wrap) {
  const previous = engine;
  engine = wrap(engine);
  return () => {
    engine = previous;
  };
}

// Stops the engine for good (tests' teardown). The Games it held are
// forgotten first, so a request still in flight (e.g. pausing a Game whose
// Seats just disconnected) fails quietly instead of losing a Game.
function stopEngine() {
  for (const room in gamesInRoom) {
    clearTimers(gamesInRoom[room]);
    delete gamesInRoom[room];
  }
  engine.stop();
}

// Turn durations (ms) by step, overriding the engine's (see TURN_DURATIONS
// in engine/game.py) for Games started from now on; tests use tiny ones.
let turnDurations;

function setTurnDurations(durations) {
  turnDurations = durations;
}

// The engine child's process id (tests kill it to simulate a crash).
function enginePid() {
  return engine.pid;
}

module.exports = { app, server, io, startServer, setResolveSession, resolveSessionViaFlask, setReportResult, setTurnDurations, setAbandonAfter, wrapEngine, stopEngine, enginePid };
if (require.main === module) {
  startServer(PORT);
}


const playersInRoom = Object.create(null);
// Server-authoritative Games by Room: { gameId, seats, views }. Each Seat is
// { playerId, name, socketId, disconnectedAt }: socketId is where its Player
// Views go (moved on Rejoin), disconnectedAt is when its socket dropped (null
// while connected; the abandoned-Game rule of #55 builds on it). `views` are
// the Player Views the engine last returned, one per Seat, so Rejoin needs no
// extra engine request.
const gamesInRoom = Object.create(null);
// Finished Games by Room, in the same shape, kept for a while after the end so
// a Seat that refreshes on the results screen can Rejoin it.
const finishedGamesInRoom = Object.create(null);
const FINISHED_GAME_KEPT_MS = 10 * 60 * 1000;
// Games lost to an engine crash or discarded as abandoned, by Room, in the
// same shape and kept as long, so their Seats' Moves and Rejoins are told
// why the Game is gone (`goneReason`).
const goneGamesInRoom = Object.create(null);
// Rooms whose Game the engine is creating right now.
const startingRooms = new Set();
// A Game in progress whose Seats have all been disconnected this long is
// discarded with no result reported (see whenEveryoneLeft).
let abandonAfterMs = 10 * 60 * 1000;

function setAbandonAfter(ms) {
  abandonAfterMs = ms;
}

// Starts a Game in the engine and sends each Seat only its own Player View.
// Every Room plays server-authoritative Games (#57): clients never send game
// state, only Moves.
async function startGame(room, players, deckSettings) {
  const gameId = crypto.randomUUID();
  // Seats are bound to Player Identity; until Guests carry one, a Guest's Seat
  // is bound to the socket it joined with.
  const seats = players.map((p) => ({
    playerId: p.playerId ?? `guest:${p.id}`,
    name: p.name,
    socketId: p.id,
    disconnectedAt: null,
  }));
  try {
    const { views, ended } = await engine.createGame({
      gameId,
      seats: seats.map((s) => ({ player_id: s.playerId, name: s.name })),
      deckSettings,
      seed: crypto.randomInt(0, 2 ** 47),
      now: Date.now(),
      durations: turnDurations,
    });
    const game = { gameId, seats, views };
    gamesInRoom[room] = game;
    seats.forEach((seat, i) => {
      io.to(seat.socketId).emit("start_game", { players, deckSettings, playerView: views[i] });
    });
    if (ended) {
      finishGame(room, game, ended);
      return;
    }
    scheduleDeadline(room, game);
    // A Seat whose socket dropped while the engine created the Game was not
    // seated yet when it disconnected.
    const now = Date.now();
    const dropped = seats.filter((s) => !io.sockets.sockets.has(s.socketId));
    dropped.forEach((s) => {
      s.disconnectedAt = now;
    });
    if (dropped.length) whenEveryoneLeft(room, game);
  } catch (e) {
    console.error(`Could not start a Game in ${room}:`, e);
    io.to(room).emit("start_game_failed", { message: "The server could not start the Game." });
  }
}

// The engine has ended `game` (and forgotten it, so this happens once per
// Game): the Room no longer has a Game in progress, and the result is
// reported with the Seats' Player Identities. The finished Game is kept for
// FINISHED_GAME_KEPT_MS so its Seats can still Rejoin the results.
function finishGame(room, game, { placings }) {
  clearTimers(game);
  if (gamesInRoom[room] === game) {
    delete gamesInRoom[room];
    finishedGamesInRoom[room] = game;
    setTimeout(() => {
      if (finishedGamesInRoom[room] === game) delete finishedGamesInRoom[room];
    }, FINISHED_GAME_KEPT_MS).unref();
    dropDisconnectedPlayers(room);
  }
  Promise.resolve()
    .then(() => reportResult({ gameId: game.gameId, placings }))
    .catch((e) => console.error(`Could not report the result of Game ${game.gameId}:`, e));
}

// Once no Game is in progress, players still disconnected leave the Room's
// list as they would have on disconnect (they can still Rejoin the results).
function dropDisconnectedPlayers(room) {
  if (!playersInRoom[room]) return;
  playersInRoom[room] = playersInRoom[room].filter((p) => !p.disconnected);
  if (playersInRoom[room].length === 0) delete playersInRoom[room];
  else io.to(room).emit("player_list", playersInRoom[room]);
}

// The engine died, and every Game in progress with it: each Seat is told its
// Game was lost and the Room no longer has a Game in progress. No result is
// reported, so no Elo changes. Finished Games are untouched: their results
// were reported when they ended.
const GAME_LOST_REASON = "The Game was lost because the game server restarted.";
const GAME_ABANDONED_REASON = "The Game was abandoned: every player had left it.";

function loseAllGames() {
  for (const room in gamesInRoom) loseGame(room, gamesInRoom[room]);
}

// One Game is lost the same way: its Seats are told, no result is reported.
function loseGame(room, game) {
  removeGame(room, game, GAME_LOST_REASON);
  game.seats.forEach((s) => io.to(s.socketId).emit("game_lost", { room, reason: GAME_LOST_REASON }));
  dropDisconnectedPlayers(room);
}

// The engine failed a request about a Game it should still hold, so its
// state can no longer be trusted: the Game is lost (as in a crash) and the
// engine is told to forget it.
function loseAfterEngineFailure(room, game, error) {
  console.error(`The engine failed on Game ${game.gameId} in ${room}; it is lost:`, error);
  loseGame(room, game);
  engine.discardGame({ gameId: game.gameId }).catch(() => {});
}

// The Game in progress in `room` ends without a result (so no Elo): it is
// kept for FINISHED_GAME_KEPT_MS only to tell its Seats why. A Move still in
// flight sees `game.goneReason`.
function removeGame(room, game, reason) {
  game.goneReason = reason;
  clearTimers(game);
  delete gamesInRoom[room];
  goneGamesInRoom[room] = game;
  setTimeout(() => {
    if (goneGamesInRoom[room] === game) delete goneGamesInRoom[room];
  }, FINISHED_GAME_KEPT_MS).unref();
}

function everyoneLeft(game) {
  return game.seats.every((s) => s.disconnectedAt !== null);
}

// Once every Seat of the Game in progress in `room` is disconnected, its
// deadline is paused (no default Moves while nobody is there, so it cannot
// finish and report Elo unattended) and it is discarded unless one of them
// Rejoins within abandonAfterMs of the last one leaving: the engine forgets
// it and no result is reported. The timer is unref'd.
function whenEveryoneLeft(room, game) {
  if (!everyoneLeft(game) || gamesInRoom[room] !== game) return;
  pauseDeadline(room, game);
  clearTimeout(game.abandonTimer);
  const lastLeft = Math.max(...game.seats.map((s) => s.disconnectedAt));
  game.abandonTimer = setTimeout(() => {
    if (gamesInRoom[room] !== game || !everyoneLeft(game)) return;
    removeGame(room, game, GAME_ABANDONED_REASON);
    dropDisconnectedPlayers(room);
    engine.discardGame({ gameId: game.gameId }).catch((e) => console.error(`Could not discard Game ${game.gameId}:`, e));
  }, Math.max(0, lastLeft + abandonAfterMs - Date.now()));
  game.abandonTimer.unref();
}

// No wake-up while paused; the engine drops the deadline from the views.
function pauseDeadline(room, game) {
  if (game.paused) return;
  game.paused = true;
  clearDeadline(game);
  engine
    .pauseDeadline({ gameId: game.gameId })
    .then(({ views }) => {
      if (gamesInRoom[room] === game && game.paused) game.views = views;
    })
    .catch((e) => {
      if (gamesInRoom[room] === game) loseAfterEngineFailure(room, game, e);
    });
}

// A Seat is back: the current step gets its full time again from now, and
// every Seat gets the new view.
async function resumeDeadline(room, game) {
  game.paused = false;
  try {
    const { views } = await engine.resumeDeadline({ gameId: game.gameId, now: Date.now() });
    if (gamesInRoom[room] !== game || game.paused) return;
    showViews(room, game, views);
  } catch (e) {
    if (gamesInRoom[room] === game) loseAfterEngineFailure(room, game, e);
  }
}

function clearTimers(game) {
  clearDeadline(game);
  clearTimeout(game.abandonTimer);
  game.abandonTimer = null;
}

// Which of `game`'s Seats is bound to the Player Identity of `socket`, or -1.
function seatOfPlayer(game, socket) {
  const playerId = socket.data.player?.playerId;
  return playerId === undefined ? -1 : game.seats.findIndex((s) => s.playerId === playerId);
}

// Which of `game`'s Seats `socket` holds, or -1. A Seat is found by
// Player Identity, or for a Guest by the socket it joined with.
function seatOf(game, socket) {
  const seat = seatOfPlayer(game, socket);
  return seat !== -1 ? seat : game.seats.findIndex((s) => s.socketId === socket.id);
}

// Sends a Move to the engine. If it is applied every Seat gets its new Player
// View; if not, only the sender hears why and nothing changes.
async function handleMove(socket, room, move) {
  const game = gamesInRoom[room];
  const seat = game ? seatOf(game, socket) : -1;
  if (seat === -1) {
    const gone = goneGamesInRoom[room];
    if (gone && seatOf(gone, socket) !== -1) {
      socket.emit("move_rejected", { reason: gone.goneReason });
      return;
    }
    socket.emit("move_rejected", { reason: "You have no Seat in a Game in this Room." });
    return;
  }
  try {
    const { views, rejected, ended } = await engine.applyMove({ gameId: game.gameId, seat, move, now: Date.now() });
    if (game.goneReason) {
      socket.emit("move_rejected", { reason: game.goneReason });
      return;
    }
    if (rejected) {
      socket.emit("move_rejected", { reason: rejected });
      return;
    }
    showViews(room, game, views, ended);
  } catch (e) {
    // The engine dying mid-Move rejects it; the Room was already told.
    if (game.goneReason) {
      socket.emit("move_rejected", { reason: game.goneReason });
      return;
    }
    console.error(`Could not apply a Move in ${room}:`, e);
    socket.emit("move_rejected", { reason: "The server could not apply the Move." });
  }
}

// The engine has changed `game`: every Seat gets its new Player View, and
// the Game either ends or waits for its next deadline.
function showViews(room, game, views, ended) {
  game.views = views;
  game.seats.forEach((s, i) => io.to(s.socketId).emit("player_view", views[i]));
  if (ended) finishGame(room, game, ended);
  else scheduleDeadline(room, game);
}

// One wake-up per Game, at the deadline in its latest Player Views (every
// Seat's view carries the same one); it replaces any earlier wake-up. None
// while the Game is paused. The timer is unref'd so it never keeps the
// process alive on its own.
function scheduleDeadline(room, game) {
  clearDeadline(game);
  if (game.paused) return;
  const deadline = game.views[0]?.deadline;
  if (typeof deadline !== "number") return;
  game.deadlineTimer = setTimeout(() => {
    game.deadlineTimer = null;
    handleDeadline(room, game).catch((e) => console.error(`Deadline handling failed in ${room}:`, e));
  }, Math.max(0, deadline - Date.now()));
  game.deadlineTimer.unref();
}

function clearDeadline(game) {
  clearTimeout(game.deadlineTimer);
  game.deadlineTimer = null;
}

// The wake-up: the engine plays the waiting Seat's default Move if its
// deadline has passed (no Move in flight beat it to it), and every Seat gets
// the new view. Either way the next deadline is scheduled. If the engine
// fails on a Game still in progress, the Game is lost rather than left frozen.
async function handleDeadline(room, game) {
  if (gamesInRoom[room] !== game || game.paused) return;
  let result;
  try {
    result = await engine.handleDeadline({ gameId: game.gameId, now: Date.now() });
  } catch (e) {
    // The Game ended, was lost or was discarded meanwhile: nothing to do.
    if (gamesInRoom[room] !== game) return;
    loseAfterEngineFailure(room, game, e);
    return;
  }
  if (gamesInRoom[room] !== game) return;
  if (result.applied) showViews(room, game, result.views, result.ended);
  else if (!game.deadlineTimer) scheduleDeadline(room, game);
}

// Rejoin: gives a Signed-in Player back their Seat in `room`'s Game (in
// progress or just finished) and its current Player View. The Seat is found
// only by the Player Identity of the connection, never by the payload; a
// Guest's Seat is bound to the socket it joined with, so it cannot be
// Rejoined until Guest Tokens exist. Anyone without a Seat gets no view.
// Unlike seatOf there is deliberately no socket-id fallback: Rejoin comes on
// a new socket, so a socket id could only match a Seat this very socket
// already holds, and must never hand a Guest's Seat to anyone.
async function rejoinSeat(socket, room, game) {
  const playerId = socket.data.player?.playerId;
  const seat = seatOfPlayer(game, socket);
  if (seat === -1) {
    socket.emit("rejoin_result", { room, playerView: null, reason: NO_SEAT_REASON });
    return;
  }
  const held = game.seats[seat];
  held.socketId = socket.id;
  held.disconnectedAt = null;
  clearTimeout(game.abandonTimer);
  if (game.paused) {
    // The first Seat back restarts the paused deadline; its view comes back
    // with the restarted one (as do the other Seats').
    await resumeDeadline(room, game);
    if (game.goneReason) {
      socket.emit("rejoin_result", { room, playerView: null, reason: game.goneReason });
      return;
    }
  }
  socket.join(room);
  if (!playersInRoom[room]) playersInRoom[room] = [];
  const listed = playersInRoom[room].find((p) => p.playerId === playerId);
  if (listed) {
    listed.id = socket.id;
    delete listed.disconnected;
  } else {
    playersInRoom[room].push({ id: socket.id, playerId, name: held.name });
  }
  io.to(room).emit("player_list", playersInRoom[room]);
  socket.emit("rejoin_result", { room, playerView: game.views[seat] });
}

const NO_SEAT_REASON = "You have no Seat in a Game in this Room.";

function isRoomCode(room) {
  return typeof room === "string" && room.length > 0;
}

io.on("connection", (socket) => {

  // Registers a handler for an event that names a Room. A payload that is not
  // an object, or whose `room` is not a room code, is ignored; a handler that
  // throws or rejects is logged instead of ending the process.
  function onRoomEvent(event, handler) {
    socket.on(event, (payload) => {
      if (payload === null || typeof payload !== "object" || !isRoomCode(payload.room)) return;
      try {
        Promise.resolve(handler(payload)).catch((e) => console.error(`${event} failed:`, e));
      } catch (e) {
        console.error(`${event} failed:`, e);
      }
    });
  }

  onRoomEvent("move", ({ room, move }) => handleMove(socket, room, move));

  

  onRoomEvent("join_game", ({ room, playerName }) => {

      if (!playersInRoom[room]) {
        playersInRoom[room] = [];
      }

      // Player Identity comes from the connection, never from the payload.
      const player = socket.data.player;
      const playerId = player?.playerId;
      const name = playerName || player?.username;

      /* Making sure someone isn't joining the room twice*/
      const alreadyJoined = playersInRoom[room].some(p =>
        p.id === socket.id || (playerId !== undefined && p.playerId === playerId)
      );

      if (!alreadyJoined) {
        playersInRoom[room].push({ id: socket.id, playerId, name });
      } 

      socket.join(room);
      console.log("Emitting player list for room", room, playersInRoom[room]);
      io.to(room).emit("player_list", playersInRoom[room]);
    });

  onRoomEvent("update_name", ({ room, newName }) => {
    if (!playersInRoom[room]) return;
    const player = playersInRoom[room].find(p => p.id === socket.id);
    if (player) {
      player.name = newName;
      io.to(room).emit("player_list", playersInRoom[room]);
    }
  });

  // Only the host (the first player listed in the Room) may start a Game,
  // with at least two players, and never while one is in progress or being
  // created: that would let anyone end a Game they are losing. These checks
  // run before any await, so two starts sent at once give one Game. A
  // refusal goes to the sender only.
  onRoomEvent("start_game", ({ room, deckSettings }) => {
    const refuse = (message) => socket.emit("start_game_failed", { message });
    if (gamesInRoom[room] || startingRooms.has(room)) return refuse("A Game is already in progress in this Room.");
    const players = playersInRoom[room] || [];
    if (!players.some((p) => p.id === socket.id)) return refuse("You are not in this Room.");
    if (players[0].id !== socket.id) return refuse("Only the host can start the Game.");
    if (players.length < 2) return refuse("A Game needs at least two players.");

    // A new Game replaces any finished or lost one kept for Rejoin.
    delete finishedGamesInRoom[room];
    delete goneGamesInRoom[room];

    deckSettingsInRoom[room] = deckSettings;

    startingRooms.add(room);
    return startGame(room, players, deckSettings).finally(() => startingRooms.delete(room));
  });

  function removePlayerFromRoom(room, predicate) {
  if (!playersInRoom[room]) return;
  playersInRoom[room] = playersInRoom[room].filter(p => !predicate(p));

  // if empty, cleanup
  const roomHasSockets = io.sockets.adapter.rooms.get(room);
  if (!roomHasSockets || roomHasSockets.size === 0 || playersInRoom[room].length === 0) {
    delete playersInRoom[room];
    delete deckSettingsInRoom[room];
   
    console.log(`Room ${room} cleaned up.`);
  } else {
    io.to(room).emit("player_list", playersInRoom[room]);
  }
}

onRoomEvent("leave_game", ({ room, playerId }) => {
  console.log("I HAVE RUN")
  try {
    // leave socket.io room
    socket.leave(room);
    // drop by playerId (stable across reconnects)
    removePlayerFromRoom(room, (p) => (playerId !== undefined && p.playerId === playerId) || p.id === socket.id);
    console.log(`${playerId} left ${room}`);
  } catch (e) {
    console.error("leave_game error:", e);
  }
});

  socket.on("disconnect", () => {
  console.log("User disconnected:", socket.id);

  // A Seat in a Game in progress survives the disconnect: it stays listed in
  // its Room, marked disconnected, until it is Rejoined.
  const seatedIn = new Set();
  for (const room in gamesInRoom) {
    for (const seat of gamesInRoom[room].seats) {
      if (seat.socketId === socket.id) {
        seat.disconnectedAt = Date.now();
        seatedIn.add(room);
      }
    }
  }
  for (const room of seatedIn) whenEveryoneLeft(room, gamesInRoom[room]);

  for (const room in playersInRoom) {
    if (seatedIn.has(room)) {
      playersInRoom[room].forEach((p) => {
        if (p.id === socket.id) p.disconnected = true;
      });
      io.to(room).emit("player_list", playersInRoom[room]);
      continue;
    }
    playersInRoom[room] = playersInRoom[room].filter(p => p.id !== socket.id);

    if (playersInRoom[room].length === 0) {
      delete playersInRoom[room];
      console.log(`Room ${room} is now empty and deleted.`);
    } else {
      io.to(room).emit("player_list", playersInRoom[room]);
    }
  }
});




  // Rejoin by Player Identity (see rejoinSeat). A finished Game answers only
  // its own Seats. Every rejoin_game is answered, so a client with no Seat
  // (a Guest after a refresh, or a Room with no Game) can say so.
  onRoomEvent("rejoin_game", ({ room }) => {
    const live = gamesInRoom[room];
    if (live) {
      return rejoinSeat(socket, room, live);
    }
    const finished = finishedGamesInRoom[room];
    if (finished && seatOfPlayer(finished, socket) !== -1) {
      return rejoinSeat(socket, room, finished);
    }
    const gone = goneGamesInRoom[room];
    if (gone && seatOfPlayer(gone, socket) !== -1) {
      socket.emit("rejoin_result", { room, playerView: null, reason: gone.goneReason });
      return;
    }
    socket.emit("rejoin_result", { room, playerView: null, reason: NO_SEAT_REASON });
  });


   //Chat system
  onRoomEvent("chat_message", ({ room, playerName, message }) => 
  {
    io.to(room).emit("chat_message", { playerName, message });
  });

  onRoomEvent("update_deck_settings", ({ room, deckSettings }) => 
  {
  console.log(`Deck settings updated for room ${room}:`, deckSettings);
  deckSettingsInRoom[room] = deckSettings;
  });


  
});