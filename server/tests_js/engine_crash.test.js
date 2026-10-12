const { server, io, startServer, setResolveSession, setReportResult, stopEngine, enginePid } = require("../server.js");
const ioClient = require("socket.io-client");
const { echoTurn } = require("./echo_turn");
const TEST_PORT = 4006;

const DECK_SETTINGS = { gold: { 1: 5, 2: 5, 3: 5 }, resource: { 1: 5, 2: 4, 3: 2, 4: 2 } };

const reports = [];
// When set, the next Move the server receives kills the engine child.
let killOnNextMove = false;

beforeAll((done) => {
  setResolveSession(async (cookieHeader) => {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader || "")?.[1];
    return {
      zeg: { user_id: 1, username: "zeg" },
      bob: { user_id: 2, username: "bob" },
    }[sid] || null;
  });
  setReportResult(async (report) => {
    reports.push(report);
  });
  // Registered after the server's own handlers, so this runs in the same tick
  // right after the server has written the Move to the engine: the Move is
  // then certainly in flight when the engine dies.
  io.on("connection", (socket) => {
    socket.on("move", () => {
      if (!killOnNextMove) return;
      killOnNextMove = false;
      process.kill(enginePid());
    });
  });
  startServer(TEST_PORT);
  done();
});

afterAll((done) => {
  stopEngine();
  server.close(done);
});

function connectAs(sid) {
  return echoTurn(
    ioClient(`http://localhost:${TEST_PORT}`, {
      forceNew: true,
      extraHeaders: sid ? { cookie: `sid=${sid}` } : {},
    }),
  );
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

// Resolves once `condition()` holds, checking every few milliseconds.
async function until(condition) {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, 10));
}

// Lets any report a lost Game might (wrongly) trigger reach the reporter.
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 200));
}

// Sends `move` from `clients[seat]` and resolves to every Seat's next Player View.
async function moveAndWait(clients, room, seat, move) {
  const next = clients.map(({ socket }) => once(socket, "player_view"));
  clients[seat].socket.emit("move", { room, move });
  return Promise.all(next);
}

// Joins every client to `room` in order, waiting until all of them are listed.
async function joinAll(room, clients) {
  for (const [i, { socket, name }] of clients.entries()) {
    const listed = new Promise((resolve) => {
      const onList = (players) => {
        if (players.length === i + 1) {
          socket.off("player_list", onList);
          resolve();
        }
      };
      socket.on("player_list", onList);
    });
    socket.emit("join_game", { room, playerName: name });
    await listed;
  }
}

// Starts a flagged Game for `clients` in `room` and resolves to each Seat's first Player View.
async function startFlaggedGame(room, clients) {
  await joinAll(room, clients);
  const starts = clients.map(({ socket }) => once(socket, "start_game"));
  clients[0].socket.emit("start_game", { room, deckSettings: DECK_SETTINGS, serverRules: true });
  return (await Promise.all(starts)).map((p) => p.playerView);
}

// Kills the real engine child process and resolves to what every Seat heard.
async function killEngine(clients) {
  const lost = clients.map(({ socket }) => once(socket, "game_lost"));
  process.kill(enginePid());
  return Promise.all(lost);
}

function threeSeats() {
  return [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
}

test("when the engine dies every Seat is told its Game was lost, with no result reported", async () => {
  const clients = threeSeats();
  try {
    const room = "crash-told";
    await startFlaggedGame(room, clients);

    const told = await killEngine(clients);
    told.forEach((payload) => expect(payload).toEqual({ room, reason: expect.any(String) }));
    await settle();
    expect(reports).toEqual([]);
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("the engine is restarted by itself, and a new flagged Game starts in a fresh Room", async () => {
  const clients = threeSeats();
  const next = threeSeats();
  try {
    await startFlaggedGame("crash-before", clients);
    const crashed = enginePid();
    await killEngine(clients);
    await until(() => enginePid() !== undefined && enginePid() !== crashed);

    const views = await startFlaggedGame("crash-after", next);
    expect(views.map((v) => v.you)).toEqual([0, 1, 2]);
    // The restarted engine holds the new Game: its Moves are played.
    const after = await moveAndWait(next, "crash-after", 0, views[0].legal_moves[0]);
    expect(after[0].you).toBe(0);
    await settle();
    expect(reports).toEqual([]);
  } finally {
    [...clients, ...next].forEach(({ socket }) => socket.disconnect());
  }
});

test("a Move into a lost Game is rejected, saying the Game was lost", async () => {
  const clients = threeSeats();
  try {
    const room = "crash-move";
    const views = await startFlaggedGame(room, clients);
    await killEngine(clients);

    const rejected = once(clients[0].socket, "move_rejected");
    clients[0].socket.emit("move", { room, move: views[0].legal_moves[0] });
    expect((await rejected).reason).toMatch(/lost/);
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("a Rejoin into a lost Game gets no Player View, saying the Game was lost", async () => {
  const clients = threeSeats();
  const extra = [];
  try {
    const room = "crash-rejoin";
    await startFlaggedGame(room, clients);
    await killEngine(clients);

    const bob = connectAs("bob");
    extra.push(bob);
    const answer = once(bob, "rejoin_result");
    bob.emit("rejoin_game", { room });
    expect(await answer).toEqual({ room, playerView: null, reason: expect.stringMatching(/lost/) });
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((s) => s.disconnect());
  }
});

test("a Move in flight when the engine dies is rejected because the Game was lost", async () => {
  const clients = threeSeats();
  try {
    const room = "crash-in-flight";
    const views = await startFlaggedGame(room, clients);

    const lost = clients.map(({ socket }) => once(socket, "game_lost"));
    const rejected = once(clients[0].socket, "move_rejected");
    killOnNextMove = true;
    clients[0].socket.emit("move", { room, move: views[0].legal_moves[0] });

    expect((await rejected).reason).toMatch(/lost/);
    await Promise.all(lost);
    const again = once(clients[1].socket, "move_rejected");
    clients[1].socket.emit("move", { room, move: { type: "take", card: 0 } });
    expect((await again).reason).toMatch(/lost/);
    await settle();
    expect(reports).toEqual([]);
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});
