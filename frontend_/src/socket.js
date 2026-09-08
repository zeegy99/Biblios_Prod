import { io } from "socket.io-client";

const socket = io("https://playbiblios.com", {
  transports: ["websocket"],
  path: "/socket.io",
});

socket.on("connect", () => {
  console.log("Connected to backend with ID:", socket.id);
});

export default socket;