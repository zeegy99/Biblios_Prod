const { server, startServer, setResolveSession, playersInRoom } = require("../server.js");
const ioClient = require("socket.io-client");
const TEST_PORT = 4005;

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

async function connectAs(sid) {
  const socket = ioClient(`http://localhost:${TEST_PORT}`, {
    forceNew: true,
    extraHeaders: { cookie: `sid=${sid}` },
  });
  sockets.push(socket);
  await once(socket, "connect");
  return socket;
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

// Resolves with the first player_list on `socket` that satisfies `predicate`.
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

async function join(socket, room, expectedCount) {
  const joined = playerListWhere(socket, (players) => players.length === expectedCount);
  socket.emit("join_game", { room, playerName: "" });
  return joined;
}

async function seatAliceAndBob(room) {
  const alice = await connectAs("alice");
  const bob = await connectAs("bob");
  await join(alice, room, 1);
  const bothSeated = playerListWhere(alice, (players) => players.length === 2);
  await join(bob, room, 2);
  await bothSeated;
  return { alice, bob };
}

test("a player emitting leave_game is removed and the others see the update", async () => {
  const { alice, bob } = await seatAliceAndBob("leave-room-1");

  const seenByBob = playerListWhere(bob, (players) => players.length === 1);
  alice.emit("leave_game", { room: "leave-room-1" });

  expect((await seenByBob).map((p) => p.playerId)).toEqual(["user:2"]);
});

test("leave_game with another player's playerId removes only the caller", async () => {
  const { alice, bob } = await seatAliceAndBob("leave-room-2");

  const seenByBob = playerListWhere(bob, (players) => players.length === 1);
  alice.emit("leave_game", { room: "leave-room-2", playerId: "user:2" });

  expect((await seenByBob).map((p) => p.playerId)).toEqual(["user:2"]);
});

test("leave_game from a socket without a seat removes no one", async () => {
  const alice = await connectAs("alice");
  await join(alice, "leave-room-3", 1);
  const bob = await connectAs("bob");

  bob.emit("leave_game", { room: "leave-room-3", playerId: "user:1" });
  // update_name round-trips through the server after leave_game has been handled.
  const after = playerListWhere(alice, () => true);
  alice.emit("update_name", { room: "leave-room-3", newName: "still here" });

  expect((await after).map((p) => p.playerId)).toEqual(["user:1"]);
});

test("an emptied Room is cleaned up", async () => {
  const alice = await connectAs("alice");
  await join(alice, "leave-room-4", 1);
  expect(playersInRoom["leave-room-4"]).toHaveLength(1);

  alice.emit("leave_game", { room: "leave-room-4" });
  // A second round-trip on the same socket is handled after leave_game.
  const bob = await connectAs("bob");
  await join(bob, "leave-room-4b", 1);
  alice.emit("join_game", { room: "leave-room-4b", playerName: "" });
  await playerListWhere(bob, (players) => players.length === 2);

  expect(playersInRoom).not.toHaveProperty("leave-room-4");
});
