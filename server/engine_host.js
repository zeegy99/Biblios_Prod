const { spawn } = require("child_process");
const readline = require("readline");

// The Python Game engine, run as a child process (ADR-0002). Requests and
// responses are JSON lines matched by id; see engine/host.py for the ops.
const PYTHON = process.env.ENGINE_PYTHON || (process.platform === "win32" ? "python" : "python3");

// { views }, plus `ended` only when the engine said the Game is over.
function withEnded(views, ended) {
  return ended ? { views, ended } : { views };
}

// A child that dies sooner than this after it was spawned counts as a quick
// exit. Restarts after quick exits in a row back off (doubling up to
// RESTART_MAX_DELAY_MS), so a missing interpreter or a host that dies on start
// is not respawned in a tight loop; the first restart is always immediate.
const QUICK_EXIT_MS = 10 * 1000;
const RESTART_BASE_DELAY_MS = 1000;
const RESTART_MAX_DELAY_MS = 30 * 1000;

// `onCrash(error)` is called whenever the child exits without stop() having
// been asked for: every Game it held is gone. A new child is started right
// away (or after the back-off above) so new Games can start.
function createEngineHost({ onCrash = () => {} } = {}) {
  let child = null;
  let nextId = 1;
  const pending = new Map();
  let quickExitsInARow = 0;
  let restartTimer = null;

  function failAll(error) {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  }

  function start() {
    clearTimeout(restartTimer);
    restartTimer = null;
    const spawnedAt = Date.now();
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
    // Writes to a dead child fail through its exit, not through stdin.
    child.stdin.on("error", () => {});
    const started = child;
    let gone = false;
    // A spawn failure (e.g. no Python) emits only `error`; a crash emits `exit`.
    function onGone(error) {
      if (gone) return;
      gone = true;
      failAll(error);
      if (child !== started) return; // stop() asked for this
      child = null;
      console.error(`${error.message}; restarting it.`);
      quickExitsInARow = Date.now() - spawnedAt < QUICK_EXIT_MS ? quickExitsInARow + 1 : 0;
      const delay = quickExitsInARow <= 1
        ? 0
        : Math.min(RESTART_MAX_DELAY_MS, RESTART_BASE_DELAY_MS * 2 ** (quickExitsInARow - 2));
      restartTimer = setTimeout(() => {
        if (!child) start();
      }, delay);
      restartTimer.unref();
      onCrash(error);
    }
    child.on("error", (e) => {
      console.error("Engine process error:", e);
      onGone(new Error(`Engine process error: ${e.message}`));
    });
    child.on("exit", (code, signal) => {
      onGone(new Error(`Engine exited (code ${code}, signal ${signal})`));
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
      return withEnded(views, ended);
    },
    // Resolves to { views } (one Player View per Seat) if the Move was applied,
    // plus `ended` if it ended the Game (reported once: the engine then
    // forgets the Game), or { rejected: reason } if the engine refused it.
    async applyMove({ gameId, seat, move }) {
      const { views, rejected, ended } = await request("apply_move", { game_id: gameId, seat, move });
      if (rejected) return { rejected };
      return withEnded(views, ended);
    },
    // The engine child's process id, or undefined while none is running
    // (tests kill it to simulate a crash).
    get pid() {
      return child?.pid;
    },
    stop() {
      clearTimeout(restartTimer);
      restartTimer = null;
      if (child) {
        child.stdin.end();
        child.kill();
        child = null;
      }
    },
  };
}

module.exports = { createEngineHost };
