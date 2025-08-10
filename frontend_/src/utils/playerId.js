
// export function getOrCreatePlayerId() {
//   let id = localStorage.getItem("playerId");
//   if (!id) {
//     id = Math.random().toString(36).substring(2, 10);
//     localStorage.setItem("playerId", id);
//     console.log("Generated new playerId:", id);
//   } else {
//     console.log("Using existing playerId:", id);
//   }
//   return id;
// }

export function getOrCreatePlayerId() {
  // DEV_MODE: return a new ID every time
  const id = Math.random().toString(36).substring(2, 10);
  console.log("DEV_MODE playerId:", id);
  return id;
} 