const { createEngineHost } = require("../engine_host.js");

const DECK_SETTINGS = { gold: { 1: 5, 2: 5, 3: 5 }, resource: { 1: 5, 2: 4, 3: 2, 4: 2 } };
const SEATS = [
  { player_id: "user:1", name: "Zeg" },
  { player_id: "user:2", name: "Bob" },
];

function createGame(host, gameId) {
  return host.createGame({ gameId, seats: SEATS, deckSettings: DECK_SETTINGS, seed: 1, now: 0 });
}

test("a stopped engine's late exit does not fail requests to the engine started after it", async () => {
  const crashes = [];
  const host = createEngineHost({ onCrash: (e) => crashes.push(e) });
  try {
    await createGame(host, "before-stop");
    host.stop();

    const { views } = await createGame(host, "after-stop");
    expect(views).toHaveLength(2);
    expect(crashes).toEqual([]);
  } finally {
    host.stop();
  }
});
