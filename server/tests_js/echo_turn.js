// Makes a test client behave like the real one: every Move it sends names
// the `turn` of the last Player View it received (a Move that names a turn
// itself keeps it). Returns the socket.
function echoTurn(socket) {
  let turn = 0;
  const remember = (view) => {
    if (view && typeof view.turn === "number") turn = view.turn;
  };
  socket.on("start_game", (payload) => remember(payload?.playerView));
  socket.on("player_view", remember);
  socket.on("rejoin_result", (payload) => remember(payload?.playerView));
  const emit = socket.emit.bind(socket);
  socket.emit = (event, payload, ...rest) => {
    if (event === "move" && payload?.move && typeof payload.move === "object" && !("turn" in payload.move)) {
      payload = { ...payload, move: { ...payload.move, turn } };
    }
    return emit(event, payload, ...rest);
  };
  return socket;
}

module.exports = { echoTurn };
