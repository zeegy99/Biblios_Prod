const { createFlaskReporter } = require("../result_reporter.js");

const RESULT = { gameId: "game-1", placings: [{ player_id: "user:1", rank: 1 }] };

// A fake fetch answering each call with the next of `outcomes`: a status
// number, or an Error to throw (a network failure). Records every call.
function fakeFetch(outcomes) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    if (outcome instanceof Error) throw outcome;
    return { ok: outcome >= 200 && outcome < 300, status: outcome };
  };
  return { fetch, calls };
}

function reporterWith(outcomes, secret = "s3cret") {
  const { fetch, calls } = fakeFetch(outcomes);
  const delays = [];
  const report = createFlaskReporter({
    url: "http://flask/api/internal/game_result",
    secret: () => secret,
    fetch,
    sleep: async (ms) => delays.push(ms),
  });
  return { report, calls, delays };
}

beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test("a report is posted once with the shared secret", async () => {
  const { report, calls, delays } = reporterWith([200]);
  await report(RESULT);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("http://flask/api/internal/game_result");
  expect(calls[0].options.method).toBe("POST");
  expect(calls[0].options.headers["X-Game-Result-Secret"]).toBe("s3cret");
  expect(JSON.parse(calls[0].options.body)).toEqual({ game_id: "game-1", placings: RESULT.placings });
  expect(delays).toEqual([]);
});

test("network errors and 5xx answers are retried with growing, capped delays", async () => {
  const { report, calls, delays } = reporterWith([new Error("ECONNREFUSED"), 503, 500, 200]);
  await report(RESULT);
  expect(calls).toHaveLength(4);
  expect(delays).toEqual([1000, 2000, 4000]);
});

test("a report that keeps failing gives up after five attempts without throwing", async () => {
  const { report, calls, delays } = reporterWith([502]);
  await expect(report(RESULT)).resolves.toBeUndefined();
  expect(calls).toHaveLength(5);
  expect(delays).toEqual([1000, 2000, 4000, 8000]);
});

test.each([400, 401, 403])("a %i answer is not retried", async (status) => {
  const { report, calls } = reporterWith([status, 200]);
  await report(RESULT);
  expect(calls).toHaveLength(1);
});

test("without a shared secret nothing is sent", async () => {
  const { report, calls } = reporterWith([200], "");
  await report(RESULT);
  expect(calls).toHaveLength(0);
});
