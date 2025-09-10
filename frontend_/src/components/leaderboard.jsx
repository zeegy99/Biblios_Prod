import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RulesPage from "./rulespage";
import "./leaderboard.css";

const LeaderBoard = () => {
  const login_info = localStorage.getItem("signin_username") || "none";
  const savedName = localStorage.getItem("playerName");
  const [elo, setElo] = useState(null);
  const isGuest = localStorage.getItem("isGuest") === "true";
  const navigate = useNavigate();
  const [showBox, setShowBox] = useState(false);
  const [rulesPage, setRulesPage] = useState(false);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    if (!isGuest && savedName) {
      fetch("https://biblios-backend.onrender.com/api/get_elo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: savedName.trim() })
      })
        .then(res => res.json())
        .then(data => setElo(data.elo ?? "N/A"))
        .catch(() => setElo("Error"));
    }
  }, [isGuest, savedName]);

  useEffect(() => {
    fetch("https://biblios-backend.onrender.com/api/get_leaderboard")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setPlayers(data);
        } else {
          console.error("Unexpected leaderboard data:", data);
        }
      })
      .catch(err => console.error("Failed to load leaderboard:", err));
  }, []);

  const handleRejoin = () => {
    const playerId = localStorage.getItem("playerId");
    const playerName = localStorage.getItem("playerName");
    const roomCode = localStorage.getItem("roomCode");

    if (!playerId || !playerName || !roomCode) {
      alert("No game to rejoin.");
      return;
    }
    socket.emit("rejoin_game", { room: roomCode, playerId, playerName });
    navigate(`/game/${roomCode}`);
  };

  return (
    <div className="leaderboard-page" >
      <header className="home-header">
        <div className="logo">BIBLIOS</div>
        <div className="nav-buttons">
          <button
            className="login-header"
            style={{ backgroundColor: "#e53935", color: "white" }}
            onClick={handleRejoin}
          >
            Rejoin
          </button>

          <button
            className="login-header"
            onClick={() => navigate("/")}
            style={{ backgroundColor: "#9694FF", color: "white" }}
          >
            Home
          </button>

          <button
            className="login-header"
            onClick={() => setRulesPage(prev => !prev)}
            style={{ backgroundColor: "#9694FF", color: "white" }}
          >
            Rules
          </button>

          {rulesPage && <RulesPage onClose={() => setRulesPage(false)} />}

          <button className="naming-button" onClick={() => setShowBox(prev => !prev)}>
            {savedName}
          </button>

          {showBox && (
            <div className="profile-dropdown">
              <p className="profile-label" style={{marginLeft: "50px"}}>You are logged in as:</p>
              <h3 className="profile-name">{login_info}</h3>
              
              <hr className="profile-divider" />
              <button
                className="profile-signout" style={{marginLeft: "30px"}}
                onClick={() => {
                  localStorage.clear();
                  navigate("/");
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Leaderboard content */}
      <div className="leaderboard-container">
        <div className="leaderboard-header">
          <h2> Leaderboard</h2>
        </div>
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>ELO</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.username}>
                <td>{index + 1}</td>
                <td>{player.username}</td>
                <td>{player.elo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeaderBoard;
