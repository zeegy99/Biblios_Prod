import React from "react";
import { useNavigate } from "react-router-dom";
import "./lobby.css";

const SignedIn = () => {
  const savedName = localStorage.getItem("playerName");
  const elo = localStorage.getItem("elo") || "-10";
  const isGuest = localStorage.getItem("isGuest") === "true";
  const navigate = useNavigate();

  if (isGuest) {
    navigate("/"); // redirect guests to home
    return null;
  }

  const toLobby = () => {
    navigate("/lobby");
  };

  return (
    <div className="home-container">
      <header className="home-header">
        <div className="logo">BIBLIOS</div>
        <div className="nav-buttons">
          <div className="status-badge">
            Logged in as {savedName} ({elo} LP)
          </div>
          <button className="login-header" onClick={() => navigate("/")}>
            Home
          </button>
        </div>
      </header>

      <main className="home-main">
        <div className="hero">
          <h1>Welcome back, {savedName}!</h1>
          <p className="tagline">Ready to play? Head to the lobby.</p>
          <div className="cta-buttons">
            <button className="play-now" onClick={toLobby}>
              Go to Lobby
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SignedIn;
