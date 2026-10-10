const { app, server, io, startServer }= require("../server.js")
const ioClient = require("socket.io-client");
const TEST_PORT = 4001;

beforeAll((done) => {
  startServer(TEST_PORT);
  done();
});

afterAll((done) => {
  server.close(done);
});

test('player successfully joins empty room', (done) => {
    const client = ioClient(`http://localhost:${TEST_PORT}`);

    client.on("connect", () => {
        client.emit("join_game", { room: "test-room", playerName: "Zeg", playerId: "abc123" });
    });

    client.on("player_list", (players) => {
        expect(players.length).toBe(1);
        expect(players[0].playerId).toBe("abc123");
        expect(players[0].name).toBe("Zeg");

        client.disconnect();
        done();
    });
})

test('player 2 successfully joins room', (done) => {
    const client = ioClient(`http://localhost:${TEST_PORT}`);

    client.on("connect", () => {
        client.emit("join_game", { room: "test-room", playerName: "Zeg", playerId: "abc123" });
        client.emit("join_game", { room: "test-room", playerName: "Bob", playerId: "abc1234" }); 
    });
    

    client.on("player_list", (players) => {
        if (players.length < 2) return;
        expect(players.length).toBe(2);
        expect(players[0].playerId).toBe("abc123");
        expect(players[0].name).toBe("Zeg");

        expect(players[1].playerId).toBe("abc1234");
        expect(players[1].name).toBe("Bob");
        client.disconnect();
        done();
    });
})

test('joining with a duplicate playerId and duplicate name', (done) => {
    const client = ioClient(`http://localhost:${TEST_PORT}`);
    let callCount = 0;

    client.on("connect", () => {
        client.emit("join_game", { room: "duplicate-room", playerName: "Zeg", playerId: "abc123" });
    });

    client.on("player_list", (players) => {
        callCount = callCount + 1;

        if (callCount === 1) {
            expect(players.length).toBe(1);
            
            //Send the next call
            client.emit("join_game", { room: "duplicate-room", playerName: "Zeg", playerId: "abc123" });
        } else if (callCount === 2) {
            expect(players.length).toBe(1);
            expect(players[0].playerId).toBe("abc123");
            expect(players[0].name).toBe("Zeg");
            client.disconnect();
            done();
        }
    });
});