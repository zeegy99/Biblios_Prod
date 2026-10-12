const { server, startServer, setResolveSession, setReportResult, setTurnDurations, stopEngine } = require("../server.js");
const ioClient = require("socket.io-client");
const TEST_PORT = 4007;

const DECK_SETTINGS = { gold: { 1: 5, 2: 5, 3: 5 }, resource: { 1: 5, 2: 4, 3: 2, 4: 2 } };
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

function connectAs(sid) {
  return ioClient(`http://localhost:${TEST_PORT}`, {
    forceNew: true,
    extraHeaders: sid ? { cookie: `sid=${sid}` } : {},
  });
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

// Resolves once `condition()` holds, checking every few milliseconds.
async function until(condition) {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, 10));
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
async function startFlaggedGame(room, clients, deckSettings = DECK_SETTINGS) {
  await joinAll(room, clients);
  const starts = clients.map(({ socket }) => once(socket, "start_game"));
  clients[0].socket.emit("start_game", { room, deckSettings, serverRules: true });
  return (await Promise.all(starts)).map((p) => p.playerView);
}

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
    const views = await startFlaggedGame("deadline-absent-donor", clients);
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
    await startFlaggedGame("deadline-nobody-plays", clients, GOLD_ONLY);
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
