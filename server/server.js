const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");

const crypto = require("crypto");
const { Server } = require("socket.io");
const { createEngineHost } = require("./engine_host");

const app = express();
app.use(cors());

const frontendPath = path.join(__dirname, "../frontend_/dist");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.send("Server is running");
});

const server = http.createServer(app);
const deckSettingsInRoom = {};
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

module.exports = { app, server, io, startServer, setResolveSession, resolveSessionViaFlask, stopEngine };
if (require.main === module) {
  startServer(PORT);
}


const playersInRoom = {};
const currentGameState = {};
// Server-authoritative Games by Room: { gameId, seats: [{ playerId, socketId }] }.
const gamesInRoom = {};

// Starts a Game in the engine and sends each Seat only its own Player View.
// The server-rules choice is fixed here for the whole Game.
async function startServerRulesGame(room, players, deckSettings) {
  const gameId = crypto.randomUUID();
  // Seats are bound to Player Identity; until Guests carry one, a Guest's Seat
  // is bound to the socket it joined with.
  const seats = players.map((p) => ({ playerId: p.playerId ?? `guest:${p.id}`, socketId: p.id }));
  try {
    const views = await engine.createGame({
      gameId,
      seats: seats.map((s, i) => ({ player_id: s.playerId, name: players[i].name })),
      deckSettings,
      seed: crypto.randomInt(0, 2 ** 47),
      now: Date.now(),
    });
    gamesInRoom[room] = { gameId, seats };
    seats.forEach((seat, i) => {
      io.to(seat.socketId).emit("start_game", { players, deckSettings, serverRules: true, playerView: views[i] });
    });
  } catch (e) {
    console.error(`Could not start a server-rules Game in ${room}:`, e);
    io.to(room).emit("start_game_failed", { message: "The server could not start the Game." });
  }
}

io.on("connection", (socket) => {

  

  socket.on("join_game", ({ room, playerName }) => {

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

  socket.on("update_name", ({ room, newName }) => {
    if (!playersInRoom[room]) return;
    const player = playersInRoom[room].find(p => p.id === socket.id);
    if (player) {
      player.name = newName;
      io.to(room).emit("player_list", playersInRoom[room]);
    }
  });

  socket.on("start_game", ({ room, deckSettings, serverRules }) => {

  deckSettingsInRoom[room] = deckSettings;

  const players = playersInRoom[room] || [];
  if (serverRules === true) {
    startServerRulesGame(room, players, deckSettings);
    return;
  }
  io.to(room).emit("start_game", { players, deckSettings });
  });

  socket.on("cursor_position", ({ room, playerName, x, y }) => 
    {
      console.log(`cursor_position received from ${playerName} at (${x}, ${y})`);
      socket.to(room).emit("cursor_position", { playerName, x, y });
    });





  socket.on("sync_game_state", ({ room, gameState }) => {
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

socket.on("leave_game", ({ room, playerId }) => {
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

  for (const room in playersInRoom) {
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
  socket.on("rejoin_game", ({ room, signin_username, playerName }) => {
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
  socket.on("chat_message", ({ room, playerName, message }) => 
  {
    io.to(room).emit("chat_message", { playerName, message });
  });

  socket.on("update_deck_settings", ({ room, deckSettings }) => 
  {
  console.log(`Deck settings updated for room ${room}:`, deckSettings);
  deckSettingsInRoom[room] = deckSettings;
  });

  socket.on("score_next", ({ room }) => {
    const gs = rooms[room]
    console.log(gs)
  })

  
});