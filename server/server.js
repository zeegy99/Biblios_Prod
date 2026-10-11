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

const engine = createEngineHost();

function stopEngine() {
  engine.stop();
}

module.exports = { app, server, io, startServer, setResolveSession, resolveSessionViaFlask, setReportResult, stopEngine };
if (require.main === module) {
  startServer(PORT);
}


const playersInRoom = Object.create(null);
const currentGameState = Object.create(null);
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

// Starts a Game in the engine and sends each Seat only its own Player View.
// The server-rules choice is fixed here for the whole Game.
async function startServerRulesGame(room, players, deckSettings) {
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
    });
    gamesInRoom[room] = { gameId, seats, views };
    seats.forEach((seat, i) => {
      io.to(seat.socketId).emit("start_game", { players, deckSettings, serverRules: true, playerView: views[i] });
    });
    if (ended) finishGame(room, gamesInRoom[room], ended);
  } catch (e) {
    console.error(`Could not start a server-rules Game in ${room}:`, e);
    io.to(room).emit("start_game_failed", { message: "The server could not start the Game." });
  }
}

// The engine has ended `game` (and forgotten it, so this happens once per
// Game): the Room no longer has a Game in progress, and the result is
// reported with the Seats' Player Identities. The finished Game is kept for
// FINISHED_GAME_KEPT_MS so its Seats can still Rejoin the results.
function finishGame(room, game, { placings }) {
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
    socket.emit("move_rejected", { reason: "You have no Seat in a server-rules Game in this Room." });
    return;
  }
  try {
    const { views, rejected, ended } = await engine.applyMove({ gameId: game.gameId, seat, move });
    if (rejected) {
      socket.emit("move_rejected", { reason: rejected });
      return;
    }
    game.views = views;
    game.seats.forEach((s, i) => io.to(s.socketId).emit("player_view", views[i]));
    if (ended) finishGame(room, game, ended);
  } catch (e) {
    console.error(`Could not apply a Move in ${room}:`, e);
    socket.emit("move_rejected", { reason: "The server could not apply the Move." });
  }
}

// Rejoin: gives a Signed-in Player back their Seat in `room`'s Game (in
// progress or just finished) and its current Player View. The Seat is found
// only by the Player Identity of the connection, never by the payload; a
// Guest's Seat is bound to the socket it joined with, so it cannot be
// Rejoined until Guest Tokens exist. Anyone without a Seat gets no view.
// Unlike seatOf there is deliberately no socket-id fallback: Rejoin comes on
// a new socket, so a socket id could only match a Seat this very socket
// already holds, and must never hand a Guest's Seat to anyone.
function rejoinSeat(socket, room, game) {
  const playerId = socket.data.player?.playerId;
  const seat = seatOfPlayer(game, socket);
  if (seat === -1) {
    socket.emit("rejoin_result", { room, playerView: null, reason: "You have no Seat in this Room's Game." });
    return;
  }
  const held = game.seats[seat];
  held.socketId = socket.id;
  held.disconnectedAt = null;
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

  onRoomEvent("start_game", ({ room, deckSettings, serverRules }) => {
  // A new Game replaces any finished one kept for Rejoin.
  delete finishedGamesInRoom[room];

  deckSettingsInRoom[room] = deckSettings;

  const players = playersInRoom[room] || [];
  if (serverRules === true) {
    startServerRulesGame(room, players, deckSettings);
    return;
  }
  io.to(room).emit("start_game", { players, deckSettings });
  });

  onRoomEvent("cursor_position", ({ room, playerName, x, y }) => 
    {
      console.log(`cursor_position received from ${playerName} at (${x}, ${y})`);
      socket.to(room).emit("cursor_position", { playerName, x, y });
    });





  onRoomEvent("sync_game_state", ({ room, gameState }) => {
    currentGameState[room] = gameState;
    io.to(room).emit("sync_game_state", gameState);
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




  //Rejoining
  onRoomEvent("rejoin_game", ({ room, signin_username, playerName }) => {
  // Flagged Rooms: Rejoin by Player Identity (see rejoinSeat). A finished
  // Game answers only its own Seats; anyone else falls through below.
  const live = gamesInRoom[room];
  if (live) {
    rejoinSeat(socket, room, live);
    return;
  }
  const finished = finishedGamesInRoom[room];
  if (finished && seatOfPlayer(finished, socket) !== -1) {
    rejoinSeat(socket, room, finished);
    return;
  }

  // Unflagged Rooms keep the old behaviour until #57. The game screen sends
  // rejoin_game { room } on every refresh; without a username there is
  // nothing to look up (it would match a Guest's undefined playerId).
  if (!signin_username) return;
  console.log(`${playerName} attempting to rejoin ${room}`);

  socket.emit("add_playerlist", ({ playerName }))
  console.log("I did the add_playerlist", playerName)


  if (!playersInRoom[room]) return;

  // Find matching player
  const player = playersInRoom[room].find(p => p.playerId === signin_username);

  if (player) {
    // Reassign new socket ID to existing player
    player.socketId = socket.id;
    socket.join(room);

    // Re-sync full game state
    const gameState = currentGameState[room];
    if (gameState) {
      socket.emit("sync_game_state", gameState);
      console.log(`${playerName} rejoined and synced`);
    }
  }
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

  onRoomEvent("score_next", ({ room }) => {
    const gs = rooms[room]
    console.log(gs)
  })

  
});