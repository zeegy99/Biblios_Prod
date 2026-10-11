const { server, startServer, setResolveSession } = require("../server.js");
const ioClient = require("socket.io-client");
const TEST_PORT = 4006;

const sockets = [];

beforeAll((done) => {
  setResolveSession(async (cookieHeader) => {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader || "")?.[1];
    return {
      alice: { user_id: 1, username: "alice" },
      bob: { user_id: 2, username: "bob" },
    }[sid] || null;
  });
  startServer(TEST_PORT);
  done();
});

afterEach(() => {
  sockets.splice(0).forEach((s) => s.disconnect());
});

afterAll((done) => {
  server.close(done);
});

// Connects and resolves once connected. Listeners registered before connecting
// (e.g. for guest_token) see every event.
async function connect({ sid, guestToken } = {}) {
  const socket = ioClient(`http://localhost:${TEST_PORT}`, {
    forceNew: true,
    autoConnect: false,
    extraHeaders: sid ? { cookie: `sid=${sid}` } : {},
    auth: guestToken ? { guestToken } : {},
  });
  sockets.push(socket);
  const token = new Promise((resolve) => socket.once("guest_token", resolve));
  const connected = once(socket, "connect");
  socket.connect();
  await connected;
  return { socket, token };
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

function playerListWhere(socket, predicate) {
  return new Promise((resolve) => {
    const listener = (players) => {
      if (predicate(players)) {
        socket.off("player_list", listener);
        resolve(players);
      }
    };
    socket.on("player_list", listener);
  });
}

async function join(socket, room, expectedCount = 1) {
  const joined = playerListWhere(socket, (players) => players.length === expectedCount);
  socket.emit("join_game", { room, playerName: "" });
  return joined;
}

// Seats `socket` in `room` with a game state, then drops the connection.
async function seatWithGameStateAndDisconnect(socket, room, gameState) {
  await join(socket, room);
  const synced = once(socket, "sync_game_state");
  socket.emit("sync_game_state", { room, gameState });
  await synced;
  const closed = once(socket, "disconnect");
  socket.disconnect();
  await closed;
}

// Resolves with whichever of the rejoin outcomes arrives first.
function rejoinOutcome(socket) {
  return Promise.race([
    once(socket, "sync_game_state").then((state) => ({ event: "sync_game_state", state })),
    once(socket, "rejoin_failed").then(() => ({ event: "rejoin_failed" })),
  ]);
}

test("a Signed-in Player who reconnects with the same Session gets the Room's game state", async () => {
  const { socket: first } = await connect({ sid: "alice" });
  await seatWithGameStateAndDisconnect(first, "rejoin-room-1", { turn: 3 });

  const { socket: second } = await connect({ sid: "alice" });
  const outcome = rejoinOutcome(second);
  second.emit("rejoin_game", { room: "rejoin-room-1" });

  expect(await outcome).toEqual({ event: "sync_game_state", state: { turn: 3 } });
});

test("a Guest who reconnects with the same Guest Token gets the Room's game state", async () => {
  const { socket: first, token } = await connect();
  const guestToken = await token;
  await seatWithGameStateAndDisconnect(first, "rejoin-room-2", { turn: 7 });

  const { socket: second } = await connect({ guestToken });
  const outcome = rejoinOutcome(second);
  second.emit("rejoin_game", { room: "rejoin-room-2" });

  expect(await outcome).toEqual({ event: "sync_game_state", state: { turn: 7 } });
});

test("after a Rejoin the seat's socket id is the new socket (update_name works)", async () => {
  const { socket: bob } = await connect({ sid: "bob" });
  await join(bob, "rejoin-room-3");
  const { socket: first } = await connect({ sid: "alice" });
  const bothSeated = playerListWhere(bob, (players) => players.length === 2);
  await join(first, "rejoin-room-3", 2);
  await bothSeated;
  first.disconnect();

  const { socket: second } = await connect({ sid: "alice" });
  const rejoined = playerListWhere(second, () => true);
  second.emit("rejoin_game", { room: "rejoin-room-3" });
  await rejoined;

  const renamed = playerListWhere(bob, (players) => players.some((p) => p.name === "Alice 2"));
  second.emit("update_name", { room: "rejoin-room-3", newName: "Alice 2" });
  const players = await renamed;

  expect(players).toHaveLength(2);
  expect(players.find((p) => p.playerId === "user:1")).toMatchObject({ id: second.id, name: "Alice 2" });
});

test("a disconnect keeps the seat in player_list", async () => {
  const { socket: bob } = await connect({ sid: "bob" });
  await join(bob, "rejoin-room-4");
  const { socket: alice } = await connect({ sid: "alice" });
  const bothSeated = playerListWhere(bob, (players) => players.length === 2);
  await join(alice, "rejoin-room-4", 2);
  await bothSeated;

  const afterDisconnect = once(bob, "player_list");
  alice.disconnect();

  expect((await afterDisconnect).map((p) => p.playerId)).toEqual(["user:2", "user:1"]);
});

test("join_game after a reconnect reattaches the existing seat instead of adding one", async () => {
  const { socket: first } = await connect({ sid: "alice" });
  await join(first, "rejoin-room-5");
  first.disconnect();

  const { socket: second } = await connect({ sid: "alice" });
  const players = await join(second, "rejoin-room-5");

  expect(players).toEqual([expect.objectContaining({ id: second.id, playerId: "user:1" })]);
});

test("a socket with a different Player Identity gets rejoin_failed and no game state", async () => {
  const { socket: alice } = await connect({ sid: "alice" });
  await seatWithGameStateAndDisconnect(alice, "rejoin-room-6", { turn: 1 });

  const { socket: bob } = await connect({ sid: "bob" });
  const outcome = rejoinOutcome(bob);
  bob.emit("rejoin_game", { room: "rejoin-room-6" });
  expect(await outcome).toEqual({ event: "rejoin_failed" });

  // Bob did not join the Room: a later Room broadcast doesn't reach him.
  let heard = false;
  bob.on("chat_message", () => { heard = true; });
  const { socket: alice2 } = await connect({ sid: "alice" });
  const back = playerListWhere(alice2, () => true);
  alice2.emit("rejoin_game", { room: "rejoin-room-6" });
  await back;
  const echoed = once(alice2, "chat_message");
  alice2.emit("chat_message", { room: "rejoin-room-6", playerName: "a", message: "hi" });
  await echoed;
  expect(heard).toBe(false);
});

test("rejoin_game for a Room that doesn't exist gets rejoin_failed", async () => {
  const { socket } = await connect({ sid: "alice" });
  const outcome = rejoinOutcome(socket);
  socket.emit("rejoin_game", { room: "no-such-room" });

  expect(await outcome).toEqual({ event: "rejoin_failed" });
});
