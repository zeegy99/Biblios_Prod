const { server, startServer, setResolveSession } = require("../server.js");
const ioClient = require("socket.io-client");
const TEST_PORT = 4004;

const sockets = [];

beforeAll((done) => {
  setResolveSession(async (cookieHeader) => {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader || "")?.[1];
    return { good: { user_id: 42, username: "alice" } }[sid] || null;
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

// Registers listeners before the socket connects, so no early event is missed.
function connect({ cookie, guestToken } = {}) {
  const socket = ioClient(`http://localhost:${TEST_PORT}`, {
    forceNew: true,
    autoConnect: false,
    extraHeaders: cookie ? { cookie } : {},
    auth: guestToken !== undefined ? { guestToken } : {},
  });
  sockets.push(socket);
  const received = { guestToken: new Promise((resolve) => socket.once("guest_token", resolve)) };
  socket.connect();
  return { socket, received };
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

// Joins a fresh Room alone and returns this socket's entry in player_list.
async function joinAlone(socket, room) {
  const players = once(socket, "player_list");
  socket.emit("join_game", { room, playerName: "P" });
  const list = await players;
  expect(list).toHaveLength(1);
  return { entry: list[0], list };
}

test("a socket with no Session and no token gets a Guest Token and a guest: Player Identity", async () => {
  const { socket, received } = connect();

  const token = await received.guestToken;
  expect(typeof token).toBe("string");
  expect(token.length).toBeGreaterThanOrEqual(32);

  const { entry } = await joinAlone(socket, "guest-room-1");
  expect(entry.playerId).toMatch(/^guest:.+/);
});

test("a second socket presenting that token gets the same Player Identity", async () => {
  const first = connect();
  const token = await first.received.guestToken;
  const { entry: firstEntry } = await joinAlone(first.socket, "guest-room-2a");

  const second = connect({ guestToken: token });
  await once(second.socket, "connect");
  const { entry: secondEntry } = await joinAlone(second.socket, "guest-room-2b");

  expect(secondEntry.playerId).toBe(firstEntry.playerId);
});

test("a known token is not re-issued", async () => {
  const first = connect();
  const token = await first.received.guestToken;

  const second = connect({ guestToken: token });
  let reissued = false;
  second.socket.on("guest_token", () => { reissued = true; });
  await once(second.socket, "connect");
  await joinAlone(second.socket, "guest-room-3");

  expect(reissued).toBe(false);
});

test("an unknown or forged token gets a new, different Guest Player Identity", async () => {
  const original = connect();
  const realToken = await original.received.guestToken;
  const { entry: originalEntry } = await joinAlone(original.socket, "guest-room-4a");

  const forged = connect({ guestToken: "forged-token" });
  const newToken = await forged.received.guestToken;
  const { entry: forgedEntry } = await joinAlone(forged.socket, "guest-room-4b");

  expect(newToken).not.toBe("forged-token");
  expect(newToken).not.toBe(realToken);
  expect(forgedEntry.playerId).toMatch(/^guest:/);
  expect(forgedEntry.playerId).not.toBe(originalEntry.playerId);
});

test("the Guest Token is not present in the player_list payload", async () => {
  const { socket, received } = connect();
  const token = await received.guestToken;

  const { list } = await joinAlone(socket, "guest-room-5");

  expect(JSON.stringify(list)).not.toContain(token);
});

test("a Signed-in Player connecting with a Guest Token still gets user:<id> and no token", async () => {
  const guest = connect();
  const token = await guest.received.guestToken;

  const user = connect({ cookie: "sid=good", guestToken: token });
  let issued = false;
  user.socket.on("guest_token", () => { issued = true; });
  await once(user.socket, "connect");
  const { entry } = await joinAlone(user.socket, "guest-room-6");

  expect(entry.playerId).toBe("user:42");
  expect(issued).toBe(false);
});

test("a Guest and a Signed-in Player join the same Room with their own identities", async () => {
  const guest = connect();
  await guest.received.guestToken;
  const user = connect({ cookie: "sid=good" });
  await once(user.socket, "connect");

  await joinAlone(guest.socket, "guest-room-7");
  const players = once(user.socket, "player_list");
  user.socket.emit("join_game", { room: "guest-room-7", playerName: "" });
  const list = await players;

  expect(list.map((p) => p.playerId)).toEqual([expect.stringMatching(/^guest:/), "user:42"]);
});
