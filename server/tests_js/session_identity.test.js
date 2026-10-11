const http = require("http");
const { server, startServer, setResolveSession, resolveSessionViaFlask } = require("../server.js");
const ioClient = require("socket.io-client");
const TEST_PORT = 4003;

beforeAll((done) => {
  startServer(TEST_PORT);
  done();
});

afterAll((done) => {
  server.close(done);
});

afterEach(() => {
  setResolveSession(async () => null);
});

function connect(cookie) {
  return ioClient(`http://localhost:${TEST_PORT}`, {
    forceNew: true,
    extraHeaders: cookie ? { cookie } : {},
  });
}

function sessionsFor(validSids) {
  return async (cookieHeader) => {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader || "")?.[1];
    return validSids[sid] || null;
  };
}

test("signed-in player appears in player_list with playerId user:<user_id>", (done) => {
  setResolveSession(sessionsFor({ good: { user_id: 42, username: "alice" } }));
  const client = connect("sid=good");

  client.on("connect", () => {
    client.emit("join_game", { room: "session-room-1", playerName: "Ali" });
  });

  client.on("player_list", (players) => {
    expect(players).toHaveLength(1);
    expect(players[0].playerId).toBe("user:42");
    expect(players[0].name).toBe("Ali");
    client.disconnect();
    done();
  });
});

test("a playerId in the join_game payload is ignored", (done) => {
  setResolveSession(sessionsFor({ good: { user_id: 42, username: "alice" } }));
  const client = connect("sid=good");

  client.on("connect", () => {
    client.emit("join_game", { room: "session-room-2", playerName: "Ali", playerId: "user:1" });
  });

  client.on("player_list", (players) => {
    expect(players[0].playerId).toBe("user:42");
    client.disconnect();
    done();
  });
});

test("an empty playerName defaults to the account username", (done) => {
  setResolveSession(sessionsFor({ good: { user_id: 42, username: "alice" } }));
  const client = connect("sid=good");

  client.on("connect", () => {
    client.emit("join_game", { room: "session-room-3", playerName: "" });
  });

  client.on("player_list", (players) => {
    expect(players[0].name).toBe("alice");
    client.disconnect();
    done();
  });
});

test("the same signed-in player joining twice is only listed once", (done) => {
  setResolveSession(sessionsFor({ good: { user_id: 42, username: "alice" } }));
  const first = connect("sid=good");
  const second = connect("sid=good");
  let firstJoined = false;

  first.on("connect", () => {
    first.emit("join_game", { room: "session-room-4", playerName: "Ali" });
  });

  first.on("player_list", () => {
    if (firstJoined) return;
    firstJoined = true;
    second.emit("join_game", { room: "session-room-4", playerName: "Ali" });
  });

  second.on("player_list", (players) => {
    expect(players).toHaveLength(1);
    first.disconnect();
    second.disconnect();
    done();
  });
});

test("leave_game without a playerId does not remove other unidentified players", (done) => {
  const stayer = connect();
  const leaver = connect();
  let stayerJoined = false;

  stayer.on("connect", () => {
    stayer.emit("join_game", { room: "session-room-5", playerName: "Stay" });
  });

  stayer.on("player_list", (players) => {
    if (!stayerJoined) {
      stayerJoined = true;
      leaver.emit("join_game", { room: "session-room-5", playerName: "Leave" });
      return;
    }
    if (players.length === 2) {
      leaver.emit("leave_game", { room: "session-room-5" });
      return;
    }
    expect(players.map(p => p.name)).toEqual(["Stay"]);
    stayer.disconnect();
    leaver.disconnect();
    done();
  });
});

test("socket still connects when session resolution throws", (done) => {
  setResolveSession(async () => {
    throw new Error("Flask unreachable");
  });
  const client = connect("sid=good");

  client.on("connect_error", (err) => done(err));
  client.on("connect", () => {
    client.disconnect();
    done();
  });
});

test("socket still connects without a session", (done) => {
  const client = connect();

  client.on("connect_error", (err) => done(err));
  client.on("connect", () => {
    client.disconnect();
    done();
  });
});

describe("resolveSessionViaFlask", () => {
  let flask;
  let flaskUrl;
  let respond;

  beforeAll((done) => {
    flask = http.createServer((req, res) => respond(req, res));
    flask.listen(0, () => {
      flaskUrl = `http://localhost:${flask.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    flask.close(done);
  });

  test("forwards the cookie and returns the user on 200", async () => {
    let seenCookie;
    respond = (req, res) => {
      seenCookie = req.headers.cookie;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ username: "alice", user_id: 42, authenticated: true }));
    };

    const user = await resolveSessionViaFlask("theme=dark; sid=good; other=x", flaskUrl);

    expect(seenCookie).toBe("sid=good");
    expect(user).toEqual({ user_id: 42, username: "alice" });
  });

  test("returns null on 401", async () => {
    respond = (req, res) => {
      res.writeHead(401);
      res.end();
    };
    expect(await resolveSessionViaFlask("sid=bad", flaskUrl)).toBeNull();
  });

  test("returns null on 5xx", async () => {
    respond = (req, res) => {
      res.writeHead(500);
      res.end();
    };
    expect(await resolveSessionViaFlask("sid=good", flaskUrl)).toBeNull();
  });

  test("returns null without calling Flask when there is no cookie", async () => {
    let called = false;
    respond = (req, res) => {
      called = true;
      res.end();
    };
    expect(await resolveSessionViaFlask(undefined, flaskUrl)).toBeNull();
    expect(called).toBe(false);
  });

  test("returns null without calling Flask when the cookie has no sid", async () => {
    let called = false;
    respond = (req, res) => {
      called = true;
      res.end();
    };
    expect(await resolveSessionViaFlask("theme=dark", flaskUrl)).toBeNull();
    expect(called).toBe(false);
  });

  test("returns null when Flask is unreachable", async () => {
    expect(await resolveSessionViaFlask("sid=good", "http://localhost:1")).toBeNull();
  });
});
