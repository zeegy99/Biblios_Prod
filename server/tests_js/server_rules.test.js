const { server, startServer, setResolveSession, stopEngine } = require("../server.js");
const ioClient = require("socket.io-client");
const TEST_PORT = 4004;

const DECK_SETTINGS = { gold: { 1: 5, 2: 5, 3: 5 }, resource: { 1: 5, 2: 4, 3: 2, 4: 2 } };

beforeAll((done) => {
  setResolveSession(async (cookieHeader) => {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader || "")?.[1];
    return { zeg: { user_id: 1, username: "zeg" }, bob: { user_id: 2, username: "bob" } }[sid] || null;
  });
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

function allCardsIn(node, found = []) {
  if (Array.isArray(node)) node.forEach((v) => allCardsIn(v, found));
  else if (node && typeof node === "object") {
    if ("type" in node && "value" in node && "isSpecial" in node) found.push(node);
    Object.values(node).forEach((v) => allCardsIn(v, found));
  }
  return found;
}

test("a flagged start gives every Seat a Player View with only its own hand", async () => {
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
  try {
    await joinAll("server-rules-room", clients);

    const starts = clients.map(({ socket }) => once(socket, "start_game"));
    clients[0].socket.emit("start_game", { room: "server-rules-room", deckSettings: DECK_SETTINGS, serverRules: true });
    const payloads = await Promise.all(starts);

    payloads.forEach((payload, seat) => {
      expect(payload.serverRules).toBe(true);
      const view = payload.playerView;
      expect(view.you).toBe(seat);
      expect(view.phase).toBe("donation");
      expect(view.seats.map((s) => s.name)).toEqual(["Zeg", "Bob", "Guest"]);
      expect(view.deck).toBeUndefined();
      expect(typeof view.deck_size).toBe("number");
      view.seats.forEach((s) => expect(s.hand).toBeUndefined());
    });

    // The first Seat donates: only it sees its current card and has legal Moves.
    const [donor, ...others] = payloads.map((p) => p.playerView);
    expect(donor.donation.cards_count).toBe(4);
    expect(donor.donation.card.isSpecial).toBe(false);
    expect(donor.legal_moves.length).toBeGreaterThan(0);
    others.forEach((view) => {
      expect(view.donation.card).toBeUndefined();
      expect(view.donation.cards_count).toBe(4);
      expect(view.legal_moves).toEqual([]);
      expect(allCardsIn(view)).toEqual([]);
    });

    // Every Seat sees the same server-rolled dice.
    payloads.forEach((p) => expect(p.playerView.dice).toEqual(donor.dice));
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("an unflagged start is unchanged: one start_game for the Room with no Player View", async () => {
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
  ];
  try {
    await joinAll("plain-room", clients);

    const starts = clients.map(({ socket }) => once(socket, "start_game"));
    clients[0].socket.emit("start_game", { room: "plain-room", deckSettings: DECK_SETTINGS });
    const payloads = await Promise.all(starts);

    payloads.forEach((payload) => {
      expect(payload.playerView).toBeUndefined();
      expect(payload.serverRules).toBeUndefined();
      expect(payload.deckSettings).toEqual(DECK_SETTINGS);
      expect(payload.players.map((p) => p.name)).toEqual(["Zeg", "Bob"]);
    });
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});
