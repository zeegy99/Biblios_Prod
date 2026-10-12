// Socket helpers shared by the jest suites that run the real server and
// engine. Each suite starts the server on its own port and gets its
// `connectAs` from connectTo(port).
const ioClient = require("socket.io-client");
const { echoTurn } = require("./echo_turn");

const DECK_SETTINGS = { gold: { 1: 5, 2: 5, 3: 5 }, resource: { 1: 5, 2: 4, 3: 2, 4: 2 } };

// connectAs(sid) opens a fresh connection with Session `sid` (or none) that
// behaves like the real client (see echo_turn.js).
function connectTo(port) {
  return function connectAs(sid) {
    return echoTurn(
      ioClient(`http://localhost:${port}`, {
        forceNew: true,
        extraHeaders: sid ? { cookie: `sid=${sid}` } : {},
      }),
    );
  };
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

// Resolves to the events `socket` received within `ms`. Only for asserting
// that something did *not* arrive; await `once` for what should.
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

// Joins `clients` to `room`, has the first (the host) start a Game, and
// resolves to each Seat's first Player View.
async function startGame(room, clients, deckSettings = DECK_SETTINGS) {
  await joinAll(room, clients);
  const starts = clients.map(({ socket }) => once(socket, "start_game"));
  clients[0].socket.emit("start_game", { room, deckSettings });
  return (await Promise.all(starts)).map((p) => p.playerView);
}

// Sends `clients[seat]`'s Move and resolves to every Seat's next Player View.
async function moveAndWait(clients, room, seat, move) {
  const next = clients.map(({ socket }) => once(socket, "player_view"));
  clients[seat].socket.emit("move", { room, move });
  return Promise.all(next);
}

module.exports = { DECK_SETTINGS, connectTo, once, collect, until, joinAll, startGame, moveAndWait };
