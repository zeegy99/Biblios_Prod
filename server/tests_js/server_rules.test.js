const { server, startServer, setResolveSession, setReportResult, stopEngine } = require("../server.js");
const ioClient = require("socket.io-client");
const TEST_PORT = 4004;

// Every Game result Node reports, captured instead of being sent to Flask.
const reports = [];

const DECK_SETTINGS = { gold: { 1: 5, 2: 5, 3: 5 }, resource: { 1: 5, 2: 4, 3: 2, 4: 2 } };

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
      expect(view.hand).toEqual([]);
      view.seats.forEach((s) => expect(s.hand).toBeUndefined());
      // A special card being played is face up for every Seat (#49); nothing else drawn is.
      expect(allCardsIn(view)).toEqual(view.donation.special ? [view.donation.special] : []);
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

// Starts a flagged Game for `clients` in `room` and resolves to each Seat's first Player View.
async function startFlaggedGame(room, clients, deckSettings = DECK_SETTINGS) {
  await joinAll(room, clients);
  const starts = clients.map(({ socket }) => once(socket, "start_game"));
  clients[0].socket.emit("start_game", { room, deckSettings, serverRules: true });
  return (await Promise.all(starts)).map((p) => p.playerView);
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

test("a legal Move sends every Seat its new Player View; a rejected one reaches only its sender", async () => {
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
  try {
    // Specials must be played on the dice first (#49), so restart in a fresh
    // Room (a fresh shuffle) until the donor draws none.
    let room, views;
    for (let tries = 0; !views || ((!views[0].donation || views[0].donation.special) && tries < 20); tries++) {
      room = `server-rules-moves-${tries}`;
      views = await startFlaggedGame(room, clients);
    }
    expect(views[0].legal_moves).toContainEqual({ type: "donate" });

    const updates = clients.map(({ socket }) => once(socket, "player_view"));
    clients[0].socket.emit("move", { room, move: { type: "donate" } });
    const after = await Promise.all(updates);
    after.forEach((view, seat) => {
      expect(view.you).toBe(seat);
      expect(view.shared_pool).toHaveLength(1);
      expect(view.donation.cards_count).toBe(3);
    });

    // Bob is not the donor: only Bob hears about it, and nobody's view changes.
    const others = [0, 2].map((i) => collect(clients[i].socket, "move_rejected"));
    const views2 = clients.map(({ socket }) => collect(socket, "player_view"));
    const bobRej = once(clients[1].socket, "move_rejected");
    clients[1].socket.emit("move", { room, move: { type: "keep" } });
    expect((await bobRej).reason).toMatch(/turn/);
    (await Promise.all(others)).forEach((got) => expect(got).toEqual([]));
    (await Promise.all(views2)).forEach((got) => expect(got).toEqual([]));
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("playing a special card changes the dice in every Seat's Player View; an illegal one reaches only its sender", async () => {
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
  try {
    // Restart in a fresh Room (a fresh shuffle) until the donor draws a special card.
    let room, views;
    for (let tries = 0; !views || (!views[0].donation?.special && tries < 40); tries++) {
      room = `server-rules-special-${tries}`;
      views = await startFlaggedGame(room, clients);
    }
    const special = views[0].donation?.special;
    expect(special).toBeTruthy();
    // Every Seat sees the special card being played; only the donor may play it.
    views.forEach((view) => expect(view.donation.special).toEqual(special));
    views.slice(1).forEach((view) => expect(view.legal_moves).toEqual([]));

    if (special.type === "Both") {
      const chosen = clients.map(({ socket }) => once(socket, "player_view"));
      clients[0].socket.emit("move", { room, move: { type: "choose_direction", direction: "plus" } });
      (await Promise.all(chosen)).forEach((view) => expect(view.donation.direction).toBe("plus"));
    }

    // A die that does not exist: only the donor hears, nobody's view changes.
    const others = [1, 2].map((i) => collect(clients[i].socket, "move_rejected"));
    const quiet = clients.map(({ socket }) => collect(socket, "player_view"));
    const zegRej = once(clients[0].socket, "move_rejected");
    clients[0].socket.emit("move", { room, move: { type: "modify_die", die: 9 } });
    expect((await zegRej).reason).toMatch(/die/);
    (await Promise.all(others)).forEach((got) => expect(got).toEqual([]));
    (await Promise.all(quiet)).forEach((got) => expect(got).toEqual([]));

    const before = views[0].dice[0].value;
    const step = special.type === "Minus" ? -1 : 1;
    const updates = clients.map(({ socket }) => once(socket, "player_view"));
    clients[0].socket.emit("move", { room, move: { type: "modify_die", die: 0 } });
    (await Promise.all(updates)).forEach((view, seat) => {
      expect(view.you).toBe(seat);
      expect(view.dice[0].value).toBe(Math.min(6, Math.max(1, before + step)));
    });
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("taking from the shared pool reaches every Seat; a take out of turn reaches only its sender", async () => {
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
  try {
    const room = "server-rules-selection";
    let view = (await startFlaggedGame(room, clients))[0];
    // The donor plays its whole turn, always making its first legal Move.
    while (view.phase === "donation") {
      expect(view.legal_moves.length).toBeGreaterThan(0);
      const next = clients.map(({ socket }) => once(socket, "player_view"));
      clients[0].socket.emit("move", { room, move: view.legal_moves[0] });
      view = (await Promise.all(next))[0];
    }
    expect(view.phase).toBe("shared_selection");
    expect(view.current_seat).toBe(1);
    const pool = view.shared_pool;
    expect(pool).toHaveLength(2);

    // The Guest's turn has not come: only the Guest hears, nobody's view changes.
    const others = [0, 1].map((i) => collect(clients[i].socket, "move_rejected"));
    const quiet = clients.map(({ socket }) => collect(socket, "player_view"));
    const guestRej = once(clients[2].socket, "move_rejected");
    clients[2].socket.emit("move", { room, move: { type: "take", card: 0 } });
    expect((await guestRej).reason).toMatch(/turn/);
    (await Promise.all(others)).forEach((got) => expect(got).toEqual([]));
    (await Promise.all(quiet)).forEach((got) => expect(got).toEqual([]));

    const updates = clients.map(({ socket }) => once(socket, "player_view"));
    clients[1].socket.emit("move", { room, move: { type: "take", card: 0 } });
    (await Promise.all(updates)).forEach((after, seat) => {
      expect(after.you).toBe(seat);
      expect(after.shared_pool).toEqual([pool[1]]);
      expect(after.current_seat).toBe(2);
      expect(after.seats[1].hand_size).toBe(1);
      if (seat === 1) expect(after.hand).toEqual([pool[0]]);
    });
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

// Sends `move` from `clients[seat]` and resolves to every Seat's next Player View.
async function moveAndWait(clients, room, seat, move) {
  const next = clients.map(({ socket }) => once(socket, "player_view"));
  clients[seat].socket.emit("move", { room, move });
  return Promise.all(next);
}

test("a bid reaches every Seat; a bid out of turn reaches only its sender", async () => {
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
  try {
    // Five Gold 1s and the specials: one donation turn uses up the ordinary
    // cards, so the Game goes to the auction with every Seat holding one
    // Gold card, whatever the shuffle.
    const goldOnly = { gold: { 1: 5, 2: 0, 3: 0 }, resource: { 1: 0, 2: 0, 3: 0, 4: 0 } };
    const room = "server-rules-auction";
    let views = await startFlaggedGame(room, clients, goldOnly);
    while (views[0].phase !== "auction") {
      const seat = views[0].current_seat;
      views = await moveAndWait(clients, room, seat, views[seat].legal_moves[0]);
    }
    const card = views[0].auction.card;
    expect(card.type).toBe("Gold");
    views.forEach((view) => {
      expect(view.auction.card).toEqual(card);
      expect(view.current_seat).toBe(0);
    });
    expect(views[0].legal_moves).toEqual([{ type: "bid", min: 1, max: 1 }, { type: "pass" }]);

    // Bob does not bid first: only Bob hears, nobody's view changes.
    const others = [0, 2].map((i) => collect(clients[i].socket, "move_rejected"));
    const quiet = clients.map(({ socket }) => collect(socket, "player_view"));
    const bobRej = once(clients[1].socket, "move_rejected");
    clients[1].socket.emit("move", { room, move: { type: "bid", amount: 1 } });
    expect((await bobRej).reason).toMatch(/turn/);
    (await Promise.all(others)).forEach((got) => expect(got).toEqual([]));
    (await Promise.all(quiet)).forEach((got) => expect(got).toEqual([]));

    const after = await moveAndWait(clients, room, 0, { type: "bid", amount: 1 });
    after.forEach((view, seat) => {
      expect(view.you).toBe(seat);
      expect(view.auction.bid).toBe(1);
      expect(view.auction.highest_bidder).toBe(0);
      expect(view.current_seat).toBe(1);
    });
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("a payment reaches every Seat; a payment with the card just won reaches only its sender", async () => {
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
  try {
    // As in the bid test: one Gold 1 goes up for auction and every Seat
    // holds one Gold 1, whatever the shuffle.
    const goldOnly = { gold: { 1: 5, 2: 0, 3: 0 }, resource: { 1: 0, 2: 0, 3: 0, 4: 0 } };
    const room = "server-rules-payment";
    let views = await startFlaggedGame(room, clients, goldOnly);
    while (views[0].phase !== "auction") {
      const seat = views[0].current_seat;
      views = await moveAndWait(clients, room, seat, views[seat].legal_moves[0]);
    }
    views = await moveAndWait(clients, room, 0, { type: "bid", amount: 1 });
    views = await moveAndWait(clients, room, 1, { type: "pass" });
    views = await moveAndWait(clients, room, 2, { type: "pass" });

    // Zeg won the Gold card: it is in Zeg's hand and gold already.
    views.forEach((view) => {
      expect(view.auction.winner).toMatchObject({ seat: 0, bid: 1 });
      expect(view.seats[0]).toMatchObject({ hand_size: 2, gold: 2 });
    });
    expect(views[0].legal_moves).toEqual([{ type: "pay", pay_in: "cards", exactly: 1, excluding: [1] }]);
    views.slice(1).forEach((view) => expect(view.legal_moves).toEqual([]));

    // Paying with the card just won: only Zeg hears, nobody's view changes.
    const others = [1, 2].map((i) => collect(clients[i].socket, "move_rejected"));
    const quiet = clients.map(({ socket }) => collect(socket, "player_view"));
    const zegRej = once(clients[0].socket, "move_rejected");
    clients[0].socket.emit("move", { room, move: { type: "pay", cards: [1] } });
    expect((await zegRej).reason).toMatch(/won/);
    (await Promise.all(others)).forEach((got) => expect(got).toEqual([]));
    (await Promise.all(quiet)).forEach((got) => expect(got).toEqual([]));

    // The only card is paid for, so the auction ends.
    const after = await moveAndWait(clients, room, 0, { type: "pay", cards: [0] });
    after.forEach((view, seat) => {
      expect(view.you).toBe(seat);
      expect(view.phase).toBe("results");
      expect(view.seats[0]).toMatchObject({ hand_size: 1, gold: 1 });
    });
    expect(after[0].hand).toEqual([views[0].hand[1]]);
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});

test("a finished Game is scored for every Seat and reported once with its placings", async () => {
  const clients = [
    { socket: connectAs("zeg"), name: "Zeg" },
    { socket: connectAs("bob"), name: "Bob" },
    { socket: connectAs(null), name: "Guest" },
  ];
  try {
    // As in the bid test: one Gold 1 goes up for auction, whatever the shuffle.
    const goldOnly = { gold: { 1: 5, 2: 0, 3: 0 }, resource: { 1: 0, 2: 0, 3: 0, 4: 0 } };
    const room = "server-rules-end";
    let views = await startFlaggedGame(room, clients, goldOnly);
    while (views[0].phase !== "auction") {
      const seat = views[0].current_seat;
      views = await moveAndWait(clients, room, seat, views[seat].legal_moves[0]);
    }
    const guestId = `guest:${clients[2].socket.id}`;
    const ours = () => reports.filter((r) => r.placings.some((p) => p.player_id === guestId));
    // Everyone passes on the only card, so the Game is over.
    for (const seat of [0, 1, 2]) views = await moveAndWait(clients, room, seat, { type: "pass" });

    views.forEach((view) => {
      expect(view.phase).toBe("results");
      expect(view.legal_moves).toEqual([]);
      expect(view.results).toEqual(views[0].results);
    });
    const { standings } = views[0].results;
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(standings.map((s) => s.elo)).toEqual([10, 0, -10]);

    // A Move after the end changes nothing and reports nothing more.
    const rej = once(clients[0].socket, "move_rejected");
    clients[0].socket.emit("move", { room, move: { type: "pass" } });
    await rej;

    const ids = ["user:1", "user:2", guestId];
    expect(ours()).toHaveLength(1);
    const [report] = ours();
    expect(typeof report.gameId).toBe("string");
    expect(report.placings).toEqual(standings.map((s) => ({ player_id: ids[s.seat], rank: s.rank })));
  } finally {
    clients.forEach(({ socket }) => socket.disconnect());
  }
});
