const { server, startServer, setResolveSession, setReportResult, setTurnDurations, setAbandonAfter, wrapEngine, stopEngine } = require("../server.js");
const { DECK_SETTINGS, connectTo, joinAll, once, startGame, until } = require("./helpers");
const TEST_PORT = 4007;
const connectAs = connectTo(TEST_PORT);

// Five Gold 1s and the specials: one donation turn, then a short auction.
const GOLD_ONLY = { gold: { 1: 5, 2: 0, 3: 0 }, resource: { 1: 0, 2: 0, 3: 0, 4: 0 } };

// Every Game result Node reports, captured instead of being sent to Flask.
const reports = [];

beforeAll((done) => {
  setResolveSession(async (cookieHeader) => {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader || "")?.[1];
    return { zeg: { user_id: 1, username: "zeg" }, bob: { user_id: 2, username: "bob" } }[sid] || null;
  });
  setReportResult(async (report) => reports.push(report));
  startServer(TEST_PORT);
  done();
});

afterAll((done) => {
  stopEngine();
  server.close(done);
});

function threeSeats() {
  return [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
}

test("an absent donor's turn is played by the server when its deadline passes, and every Seat gets the new view", async () => {
  setTurnDurations({ donation: 300, special: 300 });
  const clients = threeSeats();
  try {
    const before = Date.now();
    const views = await startGame("deadline-absent-donor", clients);
    const [first] = views;
    views.forEach((view) => {
      expect(view.deadline).toBe(first.deadline);
      expect(view.deadline).toBeGreaterThanOrEqual(before + 300);
    });

    // The donor leaves; the others still see its turn move on.
    clients[0].socket.disconnect();
    const after = await Promise.all([1, 2].map((i) => once(clients[i].socket, "player_view")));
    after.forEach((view, i) => {
      expect(view.you).toBe(i + 1);
      expect(view.deadline).toBeGreaterThan(first.deadline);
      if (first.donation.special) {
        // The special card's first default: increase, or change a die (the
        // dice start at 2-4, so a step always changes one).
        expect(view.donation.direction === "plus" || JSON.stringify(view.dice) !== JSON.stringify(first.dice)).toBe(true);
      } else {
        // The donor kept its first card.
        expect(view.donation.cards_count).toBe(first.donation.cards_count - 1);
      }
    });
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("a Game nobody plays is played to the end by default Moves and reported exactly once", async () => {
  setTurnDurations({ donation: 20, special: 20, shared_selection: 20, bid: 20, payment: 20 });
  const clients = threeSeats();
  try {
    const seen = [];
    clients[1].socket.on("player_view", (view) => seen.push(view));
    await startGame("deadline-nobody-plays", clients, GOLD_ONLY);
    const guestId = `guest:${clients[2].socket.id}`;
    const ours = () => reports.filter((r) => r.placings.some((p) => p.player_id === guestId));

    // The report is made in the server; the last view still has to arrive.
    await until(() => ours().length > 0 && seen.at(-1)?.phase === "results");
    expect(seen.at(-1).deadline).toBeNull();
    // Every phase went by on its own.
    expect(seen.some((v) => v.phase === "shared_selection")).toBe(true);
    expect(seen.some((v) => v.phase === "auction")).toBe(true);

    // Given time to settle, nothing more happens and nothing more is reported.
    const count = seen.length;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(seen).toHaveLength(count);
    expect(ours()).toHaveLength(1);
    expect(ours()[0].placings.map((p) => p.rank).sort()).toEqual([1, 2, 3]);
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

// Opens a new connection with `sid` and asks to Rejoin `room`; resolves to
// the new socket and the server's answer.
async function rejoinAs(sid, room) {
  const socket = connectAs(sid);
  const answer = once(socket, "rejoin_result");
  socket.emit("rejoin_game", { room });
  return { socket, answer: await answer };
}

// Only for asserting that nothing happens within a while.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A connection with no Seat that joins `room` after its Game has started, so
// it hears every player_list the Room gets; `lists` holds them in order.
async function watch(room) {
  const socket = connectAs(null);
  const lists = [];
  socket.on("player_list", (list) => lists.push(list));
  const listed = once(socket, "player_list");
  socket.emit("join_game", { room, playerName: "Watcher" });
  await listed;
  return { socket, lists };
}

// Disconnects every client and resolves once the server has marked each of
// `names` disconnected (as the watcher hears it).
async function everyoneLeaves(clients, watcher, names) {
  clients.forEach(({ socket }) => socket.disconnect());
  await until(() => {
    const list = watcher.lists.at(-1) || [];
    return names.every((name) => list.some((p) => p.name === name && p.disconnected));
  });
}

// Resolves once the Room's list holds only the watcher: the Game is gone and
// its disconnected players with it.
function gameGone(watcher) {
  return until(() => {
    const list = watcher.lists.at(-1) || [];
    return list.length === 1 && list[0].name === "Watcher";
  });
}

// The reports of the Game in which `guest` held a Seat.
function reportsFor(guest) {
  const guestId = `guest:${guest.id}`;
  return () => reports.filter((r) => r.placings.some((p) => p.player_id === guestId));
}

test("a Move made from a view whose turn is over is rejected", async () => {
  setTurnDurations(undefined);
  const clients = threeSeats();
  try {
    const room = "deadline-stale-turn";
    const views = await startGame(room, clients);
    expect(views[0].turn).toBe(0);
    const next = clients.map(({ socket }) => once(socket, "player_view"));
    clients[0].socket.emit("move", { room, move: views[0].legal_moves[0] });
    (await Promise.all(next)).forEach((view) => expect(view.turn).toBe(1));

    const rejected = once(clients[0].socket, "move_rejected");
    clients[0].socket.emit("move", { room, move: { ...views[0].legal_moves[0], turn: 0 } });
    expect((await rejected).reason).toMatch(/turn is over/);
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("a Game whose Seats have all been disconnected for the abandon period is discarded with no report", async () => {
  setTurnDurations(undefined);
  setAbandonAfter(100);
  const clients = threeSeats();
  const extra = [];
  try {
    const room = "deadline-abandoned";
    await startGame(room, clients);
    const ours = reportsFor(clients[2].socket);
    const watcher = await watch(room);
    extra.push(watcher.socket);
    await everyoneLeaves(clients, watcher, ["Zeg", "Bob", "Guest"]);
    await gameGone(watcher);

    const { socket, answer } = await rejoinAs("zeg", room);
    extra.push(socket);
    expect(answer.playerView).toBeNull();
    expect(answer.reason).toMatch(/abandoned/);
    expect(ours()).toEqual([]);
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((socket) => socket.disconnect());
  }
});

test("a Seat Rejoining within the abandon period keeps the Game going", async () => {
  setTurnDurations(undefined);
  setAbandonAfter(400);
  const clients = threeSeats();
  const extra = [];
  try {
    const room = "deadline-not-abandoned";
    const views = await startGame(room, clients);
    const watcher = await watch(room);
    extra.push(watcher.socket);
    // Every Seat is gone and the server knows it: the abandon timer runs.
    await everyoneLeaves(clients, watcher, ["Zeg", "Bob", "Guest"]);

    const zeg = await rejoinAs("zeg", room);
    extra.push(zeg.socket);
    expect(zeg.answer.playerView.turn).toBe(views[0].turn);
    // Well past the abandon period, the Game is still there.
    await sleep(800);
    const bob = await rejoinAs("bob", room);
    extra.push(bob.socket);
    expect(bob.answer.playerView).not.toBeNull();
    expect(bob.answer.playerView.turn).toBe(views[1].turn);
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((socket) => socket.disconnect());
  }
});

test("while every Seat is away no default Moves are played, and a Rejoin restarts the deadline from then", async () => {
  setTurnDurations({ donation: 100, special: 100, shared_selection: 100, bid: 100, payment: 100 });
  setAbandonAfter(60 * 1000);
  const clients = threeSeats();
  const extra = [];
  try {
    const room = "deadline-paused";
    await startGame(room, clients, GOLD_ONLY);
    const ours = reportsFor(clients[2].socket);
    const watcher = await watch(room);
    extra.push(watcher.socket);
    await everyoneLeaves(clients, watcher, ["Zeg", "Bob", "Guest"]);
    // Long enough for default Moves to finish this short Game, were they played.
    await sleep(1500);
    expect(ours()).toEqual([]);

    const rejoinedAt = Date.now();
    const zeg = await rejoinAs("zeg", room);
    extra.push(zeg.socket);
    const view = zeg.answer.playerView;
    expect(view.phase).not.toBe("results");
    expect(view.deadline - view.duration).toBeGreaterThanOrEqual(rejoinedAt);
    // With a Seat back, the Game moves on by itself again.
    const next = await once(zeg.socket, "player_view");
    expect(next.turn).toBe(view.turn + 1);
  } finally {
    [...clients.map((c) => c.socket), ...extra].forEach((socket) => socket.disconnect());
  }
});

test("a Seat whose connection dropped while its Game was being created counts as disconnected", async () => {
  setTurnDurations(undefined);
  setAbandonAfter(100);
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
  ];
  const extra = [];
  // Bob drops while the engine is creating the Game; the server has handled
  // it (Zeg hears the Room's list change) before the Game exists.
  const restore = wrapEngine((engine) =>
    Object.assign(Object.create(engine), {
      async createGame(args) {
        const created = await engine.createGame(args);
        const heard = once(clients[0].socket, "player_list");
        clients[1].socket.disconnect();
        await heard;
        return created;
      },
    }),
  );
  try {
    const room = "deadline-dropped-at-start";
    await joinAll(room, clients);
    const started = once(clients[0].socket, "start_game");
    clients[0].socket.emit("start_game", { room, deckSettings: DECK_SETTINGS });
    await started;
    restore();
    const watcher = await watch(room);
    extra.push(watcher.socket);
    // Zeg leaving now leaves no Seat connected, so the Game is abandoned.
    await everyoneLeaves([clients[0]], watcher, ["Zeg"]);
    await gameGone(watcher);
    const { socket, answer } = await rejoinAs("bob", room);
    extra.push(socket);
    expect(answer.reason).toMatch(/abandoned/);
  } finally {
    restore();
    [...clients.map((c) => c.socket), ...extra].forEach((socket) => socket.disconnect());
  }
});

test("a Game whose deadline the engine fails to handle is lost, with no report", async () => {
  setTurnDurations({ donation: 100, special: 100 });
  const restore = wrapEngine((engine) =>
    Object.assign(Object.create(engine), {
      async handleDeadline() {
        throw new Error("The engine could not handle the deadline");
      },
    }),
  );
  const clients = threeSeats();
  const extra = [];
  try {
    const room = "deadline-engine-fails";
    const lost = clients.map(({ socket }) => once(socket, "game_lost"));
    await startGame(room, clients);
    const ours = reportsFor(clients[2].socket);
    (await Promise.all(lost)).forEach((payload) => {
      expect(payload.room).toBe(room);
      expect(payload.reason).toMatch(/lost/);
    });
    restore();
    const { socket, answer } = await rejoinAs("bob", room);
    extra.push(socket);
    expect(answer.playerView).toBeNull();
    expect(answer.reason).toMatch(/lost/);
    await sleep(200);
    expect(ours()).toEqual([]);
  } finally {
    restore();
    [...clients.map((c) => c.socket), ...extra].forEach((socket) => socket.disconnect());
  }
});
