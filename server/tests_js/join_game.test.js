const { app, server, io, startServer, setResolveSession }= require("../server.js")
const ioClient = require("socket.io-client");
const TEST_PORT = 4001;

beforeAll((done) => {
  setResolveSession(async (cookieHeader) => {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader || "")?.[1];
    return { zeg: { user_id: 1, username: "zeg" }, bob: { user_id: 2, username: "bob" } }[sid] || null;
  });
  startServer(TEST_PORT);
  done();
});

afterAll((done) => {
  server.close(done);
});

function connectAs(sid) {
  return ioClient(`http://localhost:${TEST_PORT}`, { forceNew: true, extraHeaders: { cookie: `sid=${sid}` } });
}

test('player successfully joins empty room', (done) => {
    const client = connectAs("zeg");

    client.on("connect", () => {
        client.emit("join_game", { room: "test-room", playerName: "Zeg" });
    });

    client.on("player_list", (players) => {
        expect(players.length).toBe(1);
        expect(players[0].playerId).toBe("user:1");
        expect(players[0].name).toBe("Zeg");

        client.disconnect();
        done();
    });
})

test('player 2 successfully joins room', (done) => {
    const zeg = connectAs("zeg");
    const bob = connectAs("bob");

    zeg.on("connect", () => {
        zeg.emit("join_game", { room: "two-player-room", playerName: "Zeg" });
    });

    zeg.on("player_list", (players) => {
        if (players.length === 1) bob.emit("join_game", { room: "two-player-room", playerName: "Bob" });
    });

    bob.on("player_list", (players) => {
        expect(players.length).toBe(2);
        expect(players[0].playerId).toBe("user:1");
        expect(players[0].name).toBe("Zeg");

        expect(players[1].playerId).toBe("user:2");
        expect(players[1].name).toBe("Bob");
        zeg.disconnect();
        bob.disconnect();
        done();
    });
})

test('the same Signed-in Player joining twice is listed once', (done) => {
    const client = connectAs("zeg");
    let callCount = 0;

    client.on("connect", () => {
        client.emit("join_game", { room: "duplicate-room", playerName: "Zeg" });
    });

    client.on("player_list", (players) => {
        callCount = callCount + 1;

        if (callCount === 1) {
            expect(players.length).toBe(1);
            
            //Send the next call
            client.emit("join_game", { room: "duplicate-room", playerName: "Zeg" });
        } else if (callCount === 2) {
            expect(players.length).toBe(1);
            expect(players[0].playerId).toBe("user:1");
            expect(players[0].name).toBe("Zeg");
            client.disconnect();
            done();
        }
    });
});
