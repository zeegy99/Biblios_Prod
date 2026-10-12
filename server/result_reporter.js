// Reports a finished Game ({ gameId, placings: [{ player_id, rank }] }) to
// Flask's internal results endpoint, which applies Elo once per Game id. It
// authenticates with the shared secret; without one nothing is sent.
//
// Flask records each Game id at most once, so a report that may not have
// arrived is safe to send again: network errors and 5xx answers are retried
// with exponential backoff, up to MAX_ATTEMPTS. Any other answer (400, 401,
// 403...) would only be refused again, so it is not retried. Failures are
// logged and never thrown, so a report can never crash the server.
const MAX_ATTEMPTS = 5;
const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const ATTEMPT_TIMEOUT_MS = 10000;

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `secret` is read at report time; `fetch` and `sleep` are injectable so
// tests need neither Flask nor real waiting.
function createFlaskReporter({ url, secret, fetch = globalThis.fetch, sleep = sleepFor }) {
  return async function reportResult({ gameId, placings }) {
    const key = secret();
    if (!key) {
      console.error(`GAME_RESULT_SECRET is not set: the result of Game ${gameId} was not reported.`);
      return;
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let retry;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Game-Result-Secret": key },
          body: JSON.stringify({ game_id: gameId, placings }),
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        });
        if (res.ok) return;
        retry = res.status >= 500;
        console.error(`Flask refused the result of Game ${gameId}: HTTP ${res.status}`);
      } catch (e) {
        retry = true;
        console.error(`Could not report the result of Game ${gameId}:`, e);
      }
      if (!retry || attempt === MAX_ATTEMPTS) break;
      await sleep(Math.min(FIRST_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS));
    }
    console.error(`Gave up reporting the result of Game ${gameId}: no Elo was recorded for it.`);
  };
}

module.exports = { createFlaskReporter };
