import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_SOCKET_URL ||"https://playbiblios.com", {
  withCredentials: true,
  transports: ["websocket"],
  path: "/socket.io",
});

socket.on("connect", () => {
  console.log("Connected to backend with ID:", socket.id);
});

// Drops the connection and opens a new one, so the socket server's handshake
// resolves the Session again (ADR-0001) and the socket's Player Identity matches
// the current sign-in. The socket object stays the same, so every listener
// registered with socket.on(...) keeps working after the reconnect.
export function reconnectSocket() {
  socket.disconnect();
  socket.connect();
}

// The Room this socket holds a seat in, or null. The socket server gives a seat
// on join_game / rejoin_game and takes it away on leave_game or when the
// connection drops, so we follow exactly those.
let currentRoom = null;
const roomListeners = new Set();

function setCurrentRoom(room) {
  if (room === currentRoom) return;
  currentRoom = room;
  roomListeners.forEach((listener) => listener());
}

socket.onAnyOutgoing((event, payload) => {
  if (event === "join_game" || event === "rejoin_game") {
    setCurrentRoom(payload?.room ?? null);
  } else if (event === "leave_game") {
    setCurrentRoom(null);
  }
});

socket.on("disconnect", () => {
  setCurrentRoom(null);
});

export function getCurrentRoom() {
  return currentRoom;
}

export function subscribeToCurrentRoom(listener) {
  roomListeners.add(listener);
  return () => roomListeners.delete(listener);
}

export default socket;
