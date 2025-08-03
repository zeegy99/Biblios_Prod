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



const DEV_MODE = true; // 🔁 Set to false when deploying

const playersInRoom = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_game", ({ room, playerName, playerId}) => {


    if (!playersInRoom[room]) {
      playersInRoom[room] = [];
    }

    const alreadyJoined = playersInRoom[room].some(p => p.playerId === playerId);


    console.log("alreadyJoined", alreadyJoined)
    if (!alreadyJoined) {
      playersInRoom[room].push({ id: socket.id, playerId, name: playerName });
      console.log(`${playerName} joined room ${room}`);
    } 
    socket.join(room);
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
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const room in playersInRoom) {
      playersInRoom[room] = playersInRoom[room].filter(p => p.id !== socket.id);
      io.to(room).emit("player_list", playersInRoom[room]);
    };

    if (playersInRoom[room].length === 0) {
      delete playersInRoom[room];
    } else {
      io.to(room).emit("player_list", playersInRoom[room]);
    }
  });

  //Rejoining
  socket.on("rejoin_game", ({ room, playerId, playerName }) => {
  console.log(`🔄 ${playerName} attempting to rejoin ${room}`);

  if (!playersInRoom[room]) return;

  // Find matching player
  const player = playersInRoom[room].find(p => p.playerId === playerId);

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

  
});