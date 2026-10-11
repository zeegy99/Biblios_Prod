const { spawn } = require("child_process");
const readline = require("readline");

// The Python Game engine, run as a child process (ADR-0002). Requests and
// responses are JSON lines matched by id; see engine/host.py for the ops.
const PYTHON = process.env.ENGINE_PYTHON || (process.platform === "win32" ? "python" : "python3");

function createEngineHost() {
  let child = null;
  let nextId = 1;
  const pending = new Map();

  function failAll(error) {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  }

  function start() {
    child = spawn(PYTHON, ["-u", "-m", "engine.host"], {
      cwd: __dirname,
      stdio: ["pipe", "pipe", "inherit"],
    });
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      let response;
      try {
        response = JSON.parse(line);
      } catch (e) {
        console.error("Engine sent a malformed line:", line);
        return;
      }
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (response.ok) request.resolve(response);
      else request.reject(new Error(response.error));
    });
    const exited = child;
    child.on("error", (e) => {
      console.error("Engine process error:", e);
    });
    child.on("exit", (code, signal) => {
      if (child === exited) child = null;
      failAll(new Error(`Engine exited (code ${code}, signal ${signal})`));
    });
  }

  function request(op, payload) {
    if (!child) start();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ id, op, ...payload }) + "\n");
    });
  }

  return {
    // Resolves to { views } (one Player View per Seat, in Seat order), plus
    // `ended` ({ placings: [{ player_id, rank }] }) if the Game is already over.
    async createGame({ gameId, seats, deckSettings, seed, now }) {
      const { views, ended } = await request("create_game", {
        game_id: gameId,
        seats,
        deck_settings: deckSettings,
        seed,
        now,
      });
      return ended ? { views, ended } : { views };
    },
    // Resolves to { views } (one Player View per Seat) if the Move was applied,
    // plus `ended` if it ended the Game (reported once: the engine then
    // forgets the Game), or { rejected: reason } if the engine refused it.
    async applyMove({ gameId, seat, move }) {
      const { views, rejected, ended } = await request("apply_move", { game_id: gameId, seat, move });
      if (rejected) return { rejected };
      return ended ? { views, ended } : { views };
    },
    stop() {
      if (child) {
        child.stdin.end();
        child.kill();
        child = null;
      }
    },
  };
}

module.exports = { createEngineHost };
