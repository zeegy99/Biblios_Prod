const { app, server, io, startServer }= require("../server.js")
const ioClient = require("socket.io-client");
const TEST_PORT = 4002;

beforeAll((done) => {
  startServer(TEST_PORT);
  done();
});

afterAll((done) => {
  server.close(done);
});

test('person changes name', (done) => {
  const client = ioClient(`http://localhost:${TEST_PORT}`);
  client.on("connect", () => {
    client.emit("join_game", { room: "rename-room", playerName: "Zeg", playerId: "abc123" });
  });

  client.on("player_list", (players) => {
    if (players[0].name === "Zeg") {
      client.emit("update_name", { room: "rename-room", newName: "Bob" });
      return;
    }

    expect(players.length).toBe(1);
    expect(players[0].playerId).toBe("abc123");
    expect(players[0].name).toBe("Bob");
    client.disconnect();
    done();
  });
})