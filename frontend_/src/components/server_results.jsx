import React from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket.js";

// The end of a server-rules Game, rendered only from this Seat's Player
// View: the server scored the Game, so every Seat shows the same scoring log
// and standings. It holds no rules and posts no Elo: the server reports the
// result and Flask applies Elo to Signed-in Players.
const ServerResults = ({ view }) => {
  const navigate = useNavigate();
  const { log, standings } = view.results;

  // As the results screen's Return to Home.
  const goToHome = () => {
    const room = localStorage.getItem("roomCode");
    localStorage.removeItem("roomCode");
    sessionStorage.removeItem("start_game_payload");
    socket.emit("leave_game", { room });
    navigate("/");
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>📊 Scoring</h2>
      {log.map((line, i) => (
        <p key={i}>{line}</p>
      ))}

      <h2>🎉 Game Results</h2>
      <table style={{ borderCollapse: "collapse", margin: "1rem auto" }}>
        <thead>
          <tr>
            <th style={cellStyle}>Rank</th>
            <th style={cellStyle}>Player</th>
            <th style={cellStyle}>Points</th>
            <th style={cellStyle}>Gold</th>
            <th style={cellStyle}>ELO Δ</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.seat} style={s.seat === view.you ? { fontWeight: "bold" } : undefined}>
              <td style={cellStyle}>#{s.rank}</td>
              <td style={cellStyle}>{s.name}</td>
              <td style={cellStyle}>{s.points}</td>
              <td style={cellStyle}>{s.gold}</td>
              <td style={cellStyle}>{s.elo === null ? "—" : s.elo > 0 ? `+${s.elo}` : s.elo}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: "0.9em", color: "gray" }}>Guests have no Elo (—), but their places count.</p>

      <button onClick={goToHome}>🔄 Return to Home</button>
    </div>
  );
};

const cellStyle = {
  border: "1px solid #ccc",
  padding: "8px 16px",
  textAlign: "center",
};

export default ServerResults;
