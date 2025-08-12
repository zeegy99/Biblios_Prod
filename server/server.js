const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");

const { Server } = require("socket.io");

const app = express();
app.use(cors());

const frontendPath = path.join(__dirname, "../frontend_/dist");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.send("Server is running");
});

const server = http.createServer(app);
const deckSettingsInRoom = {};

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});



const DEV_MODE = true; 

const playersInRoom = {};

io.on("connection", (socket) => {

  

  socket.on("join_game", ({ room, playerName, playerId}) => {


    if (!playersInRoom[room]) {
      playersInRoom[room] = [];
    }

    const alreadyJoined = playersInRoom[room].some(p => p.playerId === playerId);

    if (!alreadyJoined) {
      playersInRoom[room].push({ id: socket.id, playerId, name: playerName });
      console.log(`This is what I am pushing into my list: id ${socket.id}, playerId ${playerId}, name ${playerName}`);
    } 
    socket.join(room);
    console.log("📋 Emitting player list for room", room, playersInRoom[room]);
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

  socket.on("start_game", ({ room, deckSettings }) => {

  deckSettingsInRoom[room] = deckSettings;

  const players = playersInRoom[room] || [];
  io.to(room).emit("start_game", { players, deckSettings });
});

  socket.on("cursor_position", ({ room, playerName, x, y }) => 
    {
      console.log(`cursor_position received from ${playerName} at (${x}, ${y})`);
      socket.to(room).emit("cursor_position", { playerName, x, y });
    });





  socket.on("sync_game_state", ({ room, gameState }) => {
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
    // delete currentGameState[room]; // if you have this
    console.log(`🧹 Room ${room} cleaned up.`);
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
    removePlayerFromRoom(room, (p) => p.playerId === playerId || p.id === socket.id);
    console.log(`👋 ${playerId} left ${room}`);
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
      console.log(`🧹 Room ${room} is now empty and deleted.`);
    } else {
      io.to(room).emit("player_list", playersInRoom[room]);
    }
  }
});




  //Rejoining
  socket.on("rejoin_game", ({ room, signin_username, playerName }) => {
  console.log(`🔄 ${playerName} attempting to rejoin ${room}`);

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
      console.log(`✅ ${playerName} rejoined and synced`);
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