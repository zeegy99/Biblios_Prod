const { createEngineHost } = require("../engine_host.js");

const DECK_SETTINGS = { gold: { 1: 5, 2: 5, 3: 5 }, resource: { 1: 5, 2: 4, 3: 2, 4: 2 } };
const SEATS = [
  { player_id: "user:1", name: "Zeg" },
  { player_id: "user:2", name: "Bob" },
];

function createGame(host, gameId) {
  return host.createGame({ gameId, seats: SEATS, deckSettings: DECK_SETTINGS, seed: 1, now: 0 });
}

test("stop() is final: later requests are refused, no engine is started, and its exit is no crash", async () => {
  const crashes = [];
  const host = createEngineHost({ onCrash: (e) => crashes.push(e) });
  try {
    await createGame(host, "before-stop");
    host.stop();

    await expect(createGame(host, "after-stop")).rejects.toThrow(/stopped/);
    await expect(host.pauseDeadline({ gameId: "before-stop" })).rejects.toThrow(/stopped/);
    expect(host.pid).toBeUndefined();
    // Give the stopped child time to exit: that is not a crash.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(crashes).toEqual([]);
    expect(host.pid).toBeUndefined();
  } finally {
    host.stop();
  }
});
