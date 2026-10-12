import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ServerDonationPhase from "./server_donation_phase";
import ServerSharedSelection from "./server_shared_selection";
import ServerAuctionPhase from "./server_auction_phase";
import ServerResults from "./server_results";
import socket from "../socket";
import PlayerHand from "./player_hand";
import RulesPage from "./rulespage";
import "./lobby.css";
import "./game_layout.css";

// Every Game lives on the server (#57): this screen only renders this Seat's
// Player View and sends Moves. It never shuffles, rolls dice, applies rules
// or sends game state.
const GameRunner = ({ playerName }) => {
  const { room } = useParams();
  const navigate = useNavigate();

  const [playerView, setPlayerView] = useState(null);
  // Why the server refused this Seat's last Move; cleared by the next Player View.
  const [moveRejection, setMoveRejection] = useState(null);
  // Why the server gave no Seat back on Rejoin (e.g. a Guest after a refresh).
  const [rejoinRefusal, setRejoinRefusal] = useState(null);
  const [playersOnline, setPlayersOnline] = useState([]);
  const [rulesPage, setRulesPage] = useState(false);

  useEffect(() => {
    const onPlayerView = (view) => {
      setPlayerView(view);
      setMoveRejection(null);
    };
    const onMoveRejected = ({ reason }) => setMoveRejection(reason);
    socket.on("player_view", onPlayerView);
    socket.on("move_rejected", onMoveRejected);
    return () => {
      socket.off("player_view", onPlayerView);
      socket.off("move_rejected", onMoveRejected);
    };
  }, []);

  useEffect(() => {
    const onRejoinResult = ({ room: rejoined, playerView: view, reason }) => {
      if (rejoined !== room) return;
      if (view) setPlayerView(view);
      else setRejoinRefusal(reason);
    };
    socket.on("rejoin_result", onRejoinResult);
    return () => socket.off("rejoin_result", onRejoinResult);
  }, [room]);

  // The server lost this Room's Game (its engine crashed, or everyone left
  // it): go back to the lobby.
  useEffect(() => {
    const onGameLost = ({ room: lostRoom, reason }) => {
      if (lostRoom !== room) return;
      setPlayerView(null);
      setMoveRejection(null);
      sessionStorage.removeItem("start_game_payload");
      alert(reason);
      navigate("/lobby");
    };
    socket.on("game_lost", onGameLost);
    return () => socket.off("game_lost", onGameLost);
  }, [room, navigate]);

  // The lobby hands over the start_game payload, which carries this Seat's
  // first Player View. Without one (a refresh, or Rejoin from the home
  // screen) the server gives back this Seat's Player View, found by the
  // Session of this connection, or says we have none.
  useEffect(() => {
    if (!playerName) return undefined;
    const onPlayerList = (list) => setPlayersOnline(list);
    socket.on("player_list", onPlayerList);
    socket.emit("join_game", { room: `${room}`, playerName });

    const cachedStart = sessionStorage.getItem("start_game_payload");
    if (cachedStart) {
      const { playerView: startView } = JSON.parse(cachedStart);
      sessionStorage.removeItem("start_game_payload");
      if (startView) setPlayerView(startView);
    } else {
      socket.emit("rejoin_game", { room: `${room}` });
    }

    return () => socket.off("player_list", onPlayerList);
  }, [playerName, room]);

  const backToLobby = () => {
    sessionStorage.removeItem("start_game_payload");
    navigate("/lobby");
  };

  // Seats whose connection dropped; they keep their Seat and may Rejoin.
  const disconnectedNames = playersOnline.filter((p) => p?.disconnected).map((p) => p.name);

  if (playerView) {
    return (
      <div>
        <h1 className="game-title">Biblios Game</h1>
        <button style={{marginLeft: "200px", marginTop: "10px"}} className={'menu-button'} onClick={() => setRulesPage((prev) => !prev)}>
          Rules
        </button>
        {rulesPage && <RulesPage onClose={() => setRulesPage(false)} />}
        <p style={{ textAlign: "center" }}>Current Phase: {playerView.phase}</p>
        {disconnectedNames.length > 0 && (
          <p style={{ textAlign: "center", color: "gray" }}>Disconnected: {disconnectedNames.join(", ")}</p>
        )}
        <h3 style={{ textAlign: "center" }}>🎲 Dice Values</h3>
        <ul style={{ display: "flex", justifyContent: "center", listStyle: "none", padding: 0, gap: "12px" }}>
          {playerView.dice.map((die) => (
            <li
              key={die.resource_type}
              style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: "8px", backgroundColor: "#f9f9f9", minWidth: "80px", textAlign: "center" }}
            >
              <strong>{die.resource_type}</strong>: {die.value}
            </li>
          ))}
        </ul>
        <p style={{ textAlign: "center" }}>
          Remaining deck: {playerView.deck_size} cards · Discard: {playerView.discard_size} cards
        </p>
        {moveRejection && (
          <p role="alert" style={{ textAlign: "center", color: "crimson" }}>Move refused: {moveRejection}</p>
        )}
        {playerView.phase === "donation" && <ServerDonationPhase view={playerView} />}
        {playerView.phase === "shared_selection" && <ServerSharedSelection view={playerView} />}
        {playerView.phase === "auction" && <ServerAuctionPhase view={playerView} />}
        {/* The server scores the Game and reports Elo. */}
        {playerView.phase === "results" && <ServerResults view={playerView} />}
        <div style={{ marginTop: "30px", textAlign: "center" }}>
          <h4>Your Hand ↓</h4>
          <ul style={{ display: "flex", justifyContent: "center", listStyle: "none", padding: 0, gap: "10px" }}>
            <PlayerHand hand={playerView.hand} isCurrentPlayer={true} />
          </ul>
        </div>
      </div>
    );
  }

  if (rejoinRefusal) {
    return (
      <div style={{ textAlign: "center" }}>
        <p>{rejoinRefusal}</p>
        <button className={'menu-button'} onClick={backToLobby}>Back to the lobby</button>
      </div>
    );
  }

  return <div>Waiting for game state to initialize...</div>;
};

export default GameRunner;
