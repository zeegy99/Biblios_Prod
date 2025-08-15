// import { io } from "socket.io-client";

// console.log("Attempting to connect to socket...");
// const socket = io("http://localhost:3001", {
//   transports: ["websocket"],
//   path: "/socket.io",
// });
// socket.on("connect", () => {
//   console.log("✅ Connected to backend with ID:", socket.id);
// });

// export default socket;

import { io } from "socket.io-client";

console.log("Attempting to connect to socket...");
const socket = io("https://biblios-game.onrender.com", {
  transports: ["websocket"],
  path: "/socket.io",
});

socket.on("connect", () => {
  console.log("✅ Connected to backend with ID:", socket.id);
});

export default socket;