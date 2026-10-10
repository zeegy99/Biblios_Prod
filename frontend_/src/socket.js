import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_SOCKET_URL ||"https://playbiblios.com", {
  withCredentials: true,
  transports: ["websocket"],
  path: "/socket.io",
});

socket.on("connect", () => {
  console.log("Connected to backend with ID:", socket.id);
});

export default socket;