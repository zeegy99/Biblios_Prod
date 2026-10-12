const { server, startServer, setResolveSession, setReportResult, stopEngine } = require("../server.js");
const ioClient = require("socket.io-client");
const { echoTurn } = require("./echo_turn");
const TEST_PORT = 4005;

const DECK_SETTINGS = { gold: { 1: 5, 2: 5, 3: 5 }, resource: { 1: 5, 2: 4, 3: 2, 4: 2 } };

beforeAll((done) => {
  setResolveSession(async (cookieHeader) => {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader || "")?.[1];
    return {
      zeg: { user_id: 1, username: "zeg" },
      bob: { user_id: 2, username: "bob" },
      eve: { user_id: 3, username: "eve" },
    }[sid] || null;
  });
  setReportResult(async () => {});
  startServer(TEST_PORT);
  done();
});

afterAll(async () => {
  // The last tests leave Games in progress (every start is a Game, even in a
  // junk Room); let the server finish pausing them before the engine stops,
  // or the pause would reach a fresh engine that never held them.
  await new Promise((resolve) => setTimeout(resolve, 300));
  stopEngine();
  await new Promise((resolve) => server.close(resolve));
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

// Resolves to the events `socket` received within `ms`.
function collect(socket, event, ms = 300) {
  const got = [];
  const handler = (payload) => got.push(payload);
  socket.on(event, handler);
  return new Promise((resolve) =>
    setTimeout(() => {
      socket.off(event, handler);
      resolve(got);
    }, ms),
  );
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

// Starts a Game for `clients` in `room` and resolves to each Seat's first Player View.
async function startGame(room, clients, deckSettings = DECK_SETTINGS) {
  await joinAll(room, clients);
  const starts = clients.map(({ socket }) => once(socket, "start_game"));
  clients[0].socket.emit("start_game", { room, deckSettings });
  return (await Promise.all(starts)).map((p) => p.playerView);
}

// Disconnects `clients[seat]` and resolves once another Seat has heard about it.
async function dropConnection(clients, seat) {
  const witness = clients.find((_, i) => i !== seat).socket;
  const heard = once(witness, "player_list");
  clients[seat].socket.disconnect();
  return heard;
}

// Opens a new connection with `sid` and asks to Rejoin `room`; resolves to
// the new socket and the server's answer.
async function rejoinAs(sid, room) {
  const socket = connectAs(sid);
  const answer = once(socket, "rejoin_result");
  socket.emit("rejoin_game", { room });
  return { socket, answer: await answer };
}

// Sends `move` from `clients[seat]` and resolves to every Seat's next Player View.
async function moveAndWait(clients, room, seat, move) {
  const next = clients.map(({ socket }) => once(socket, "player_view"));
  clients[seat].socket.emit("move", { room, move });
  return Promise.all(next);
}

function threeSeats() {
  return [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
}

test("a Signed-in Player who reconnects with the same Session gets their Seat's current Player View", async () => {
  const clients = threeSeats();
  const extra = [];
  try {
    const room = "rejoin-same-session";
    const views = await startGame(room, clients);
    await dropConnection(clients, 1);

    const { socket, answer } = await rejoinAs("bob", room);
    extra.push(socket);
    expect(answer.room).toBe(room);
    expect(answer.playerView).toEqual(views[1]);
    expect(answer.playerView.deck).toBeUndefined();
    answer.playerView.seats.forEach((s) => expect(s.hand).toBeUndefined());
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((s) => s.disconnect());
  }
});

test("after a Rejoin the Seat's Player Views reach the new socket and it can still make its Moves", async () => {
  const clients = threeSeats();
  try {
    const room = "rejoin-keeps-playing";
    let views = await startGame(room, clients);
    await dropConnection(clients, 1);
    const { socket } = await rejoinAs("bob", room);
    clients[1] = { socket, name: "Bob" };

    // The donor plays its whole turn; Bob's new socket sees every Move.
    while (views[0].phase === "donation") {
      views = await moveAndWait(clients, room, 0, views[0].legal_moves[0]);
      expect(views[1].you).toBe(1);
    }
    expect(views[0].phase).toBe("shared_selection");
    expect(views[0].current_seat).toBe(1);

    // Bob's Seat was never freed: Bob takes from the shared pool.
    const pool = views[1].shared_pool;
    views = await moveAndWait(clients, room, 1, { type: "take", card: 0 });
    expect(views[1].hand).toEqual([pool[0]]);
    expect(views[0].current_seat).toBe(2);
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("another Player Identity gets no Seat and no Player View, and the Seat stays its owner's", async () => {
  const clients = threeSeats();
  const extra = [];
  try {
    const room = "rejoin-other-identity";
    const views = await startGame(room, clients);
    await dropConnection(clients, 1);

    const eve = await rejoinAs("eve", room);
    extra.push(eve.socket);
    expect(eve.answer).toEqual({ room, playerView: null, reason: expect.any(String) });

    // Eve hears nothing of the Game's Moves; Bob can still Rejoin his Seat.
    const quiet = collect(eve.socket, "player_view");
    await moveAndWait([clients[0], clients[2]], room, 0, views[0].legal_moves[0]);
    expect(await quiet).toEqual([]);
    const bob = await rejoinAs("bob", room);
    extra.push(bob.socket);
    expect(bob.answer.playerView.you).toBe(1);
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((s) => s.disconnect());
  }
});

test("a Guest cannot Rejoin: a new Guest connection gets no Seat", async () => {
  const clients = threeSeats();
  const extra = [];
  try {
    const room = "rejoin-guest";
    await startGame(room, clients);
    await dropConnection(clients, 2);

    const guest = await rejoinAs(null, room);
    extra.push(guest.socket);
    expect(guest.answer.playerView).toBeNull();
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((s) => s.disconnect());
  }
});

test("a disconnected Seat stays listed in the Room, marked disconnected until it Rejoins", async () => {
  const clients = threeSeats();
  const extra = [];
  try {
    const room = "rejoin-listed";
    await startGame(room, clients);
    const list = await dropConnection(clients, 1);
    expect(list.map((p) => [p.name, !!p.disconnected])).toEqual([["Zeg", false], ["Bob", true], ["Guest", false]]);

    const relisted = once(clients[0].socket, "player_list");
    const bob = await rejoinAs("bob", room);
    extra.push(bob.socket);
    expect((await relisted).map((p) => [p.name, !!p.disconnected])).toEqual([["Zeg", false], ["Bob", false], ["Guest", false]]);
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((s) => s.disconnect());
  }
});

test("Rejoining a finished Game returns its results; Seats still disconnected at the end leave the Room's list", async () => {
  const clients = threeSeats();
  const extra = [];
  try {
    // One Gold 1 goes up for auction whatever the shuffle; everyone passes on it.
    const goldOnly = { gold: { 1: 5, 2: 0, 3: 0 }, resource: { 1: 0, 2: 0, 3: 0, 4: 0 } };
    const room = "rejoin-finished";
    let views = await startGame(room, clients, goldOnly);
    while (views[0].phase !== "auction") {
      const seat = views[0].current_seat;
      views = await moveAndWait(clients, room, seat, views[seat].legal_moves[0]);
    }
    for (const seat of [0, 1]) views = await moveAndWait(clients, room, seat, { type: "pass" });

    // Bob drops before the last pass ends the Game.
    await dropConnection(clients, 1);
    const present = [clients[0], clients[2]];
    const listed = once(clients[0].socket, "player_list");
    const final = await moveAndWait(present, room, 1, { type: "pass" });
    expect(final[0].phase).toBe("results");
    expect((await listed).map((p) => p.name)).toEqual(["Zeg", "Guest"]);

    const bob = await rejoinAs("bob", room);
    extra.push(bob.socket);
    expect(bob.answer.playerView.phase).toBe("results");
    expect(bob.answer.playerView.you).toBe(1);
    expect(bob.answer.playerView.results).toEqual(final[0].results);
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((s) => s.disconnect());
  }
});

test("a finished Game answers Rejoin only for its own Seats, and never once a new Game starts", async () => {
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs(null), name: "Guest" },
  ];
  const extra = [];
  try {
    // Only the special cards: the Game is over as soon as it starts.
    const empty = { gold: { 1: 0, 2: 0, 3: 0 }, resource: { 1: 0, 2: 0, 3: 0, 4: 0 } };
    const room = "rejoin-finished-then-new";
    await startGame(room, clients, empty);

    // Bob held no Seat: he gets no answer.
    const bob = connectAs("bob");
    extra.push(bob);
    const bobAnswers = collect(bob, "rejoin_result");
    bob.emit("rejoin_game", { room });
    expect(await bobAnswers).toEqual([]);

    // Zeg leaves and Bob joins; a new Game starts in the same Room: Zeg's
    // old Seat is gone, and he has none in the new Game.
    const zegLeft = once(clients[1].socket, "player_list");
    clients[0].socket.emit("leave_game", { room });
    await zegLeft;
    const bobListed = once(bob, "player_list");
    bob.emit("join_game", { room, playerName: "Bob" });
    await bobListed;
    const newStarts = [once(clients[1].socket, "start_game"), once(bob, "start_game")];
    clients[1].socket.emit("start_game", { room, deckSettings: DECK_SETTINGS });
    await Promise.all(newStarts);
    const zeg = connectAs("zeg");
    extra.push(zeg);
    const zegAnswer = once(zeg, "rejoin_result");
    zeg.emit("rejoin_game", { room });
    const answer = await zegAnswer;
    expect(answer.playerView).toBeNull();
    expect(answer.reason).toMatch(/no Seat/);
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((s) => s.disconnect());
  }
});

test("payloads that are not objects, or name a Room like an Object property, never crash the server", async () => {
  const socket = connectAs("zeg");
  const later = connectAs("bob");
  // Outside jest any of these would end the Node process.
  const crashes = [];
  const onCrash = (e) => crashes.push(e);
  process.on("uncaughtException", onCrash);
  process.on("unhandledRejection", onCrash);
  try {
    const events = [
      "rejoin_game", "move", "join_game", "start_game", "update_name", "leave_game",
      "sync_game_state", "chat_message", "update_deck_settings", "cursor_position",
    ];
    const payloads = [
      null, 5, "room", [], {},
      { room: "constructor" }, { room: "__proto__" }, { room: "toString" }, { room: "hasOwnProperty" },
      { room: {} }, { room: ["a"] },
    ];
    for (const event of events) for (const payload of payloads) socket.emit(event, payload);
    const rejected = once(socket, "move_rejected");
    socket.emit("move", { room: "constructor", move: { type: "pass" } });
    expect((await rejected).reason).toMatch(/Seat/);

    // The server is still up and Rooms still work.
    const list = once(later, "player_list");
    later.emit("join_game", { room: "rejoin-after-junk", playerName: "Bob" });
    expect((await list).map((p) => p.name)).toEqual(["Bob"]);
    expect(crashes).toEqual([]);
  } finally {
    process.off("uncaughtException", onCrash);
    process.off("unhandledRejection", onCrash);
    socket.disconnect();
    later.disconnect();
  }
});
