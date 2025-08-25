import React, { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";import { getOrCreatePlayerId } from "../utils/playerId";
import Timer from "../timer.jsx";
import "./lobby.css";
import RulesPage from "./rulespage"; 


const generateRoomCode = () =>
  Math.random().toString(36).substring(2, 7).toUpperCase();

const playerId = getOrCreatePlayerId();


const Home = ({ setPlayerName }) => {
  
  const savedName = localStorage.getItem("playerName") || "";


  const elo = localStorage.getItem("elo") || "-10";

  const [nameInput, setNameInput] = useState(savedName);
  const [roomInput, setRoomInput] = useState("");
  const [showBox, setShowBox] = useState(false);
  const [tempName, setTempName] = useState(localStorage.getItem("playerName") || "");
  const [rulesPage, setRulesPage] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const localStorageVol = localStorage.getItem("Volume") || 50;
    localStorage.setItem("Volume", localStorageVol)
  
  const name = localStorage.getItem("playerName");
  const isGuest = localStorage.getItem("isGuest") === "true";

  if (name && !isGuest) {
    navigate("/signedin");
  }
}, []);

  const toggleDropDown = () => {
    setShowBox((prev) => !prev);
  };

  const toggleRulesPage = () => {
    setRulesPage((prev) => {
    return !prev;
  });
  }

  const updateName = () => {
    if (tempName.trim()) {
      localStorage.setItem("playerName", tempName);
      setPlayerName(tempName);
      setNameInput(tempName);
      setShowBox(false);
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!nameInput || !roomInput) return;
    localStorage.setItem("playerName", nameInput);
    localStorage.setItem("roomCode", roomInput.toUpperCase());
    localStorage.setItem("isGuest", "true")
    setPlayerName(nameInput);
    navigate("/lobby");
  };

  const handleCreateRoom = () => {
    if (!nameInput) return alert("Enter your name first.");
    const newRoom = generateRoomCode();
    console.log(newRoom)
    localStorage.setItem("playerName", nameInput);
    localStorage.setItem("roomCode", newRoom);
    localStorage.setItem("isGuest", "true")
    setPlayerName(nameInput);
    navigate("/lobby");
  };

  const toSigninPage = () => {
    navigate("/signin")
  }



  return (
    <div className="home-container">
  <header className="home-header">
    <div className="logo">BIBLIOS</div>
    <div className="nav-buttons">

      
  
  <button className="play-now-header" onClick={handleCreateRoom}>Play Now</button>
  <button
    className="login-header"
    onClick={() => navigate("/leaderboard")}
    style={{ backgroundColor: "#9694FF", color: "white" }}
  >
            Leaderboard
  </button>

  <button className="login-header" onClick={toggleRulesPage}
    style={{ backgroundColor: "#9694FF", color: "white" }}>
    Rules
  </button>

        
  <button className={'naming-button'} onClick={toSigninPage}>Log In</button>
</div>

  </header>

  <main className="home-main">
    <div className="home-card left-card">
      <h2> Playing as {nameInput ? nameInput : "Guest"}</h2>
      <h2 >Join or Create a Room</h2>

      {!savedName && (
        <input
          className="home-input"
          type="text"
          placeholder="Your Name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
        />
      )}

      <input
        className="home-input"
        type="text"
        placeholder="Enter Room Code"
        value={roomInput}
        onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
      />

      <button className="home-button" onClick={handleJoin}>
        Join Room
      </button>

      <div className="divider">or</div>

      <button className="home-button" onClick={handleCreateRoom}>
        🎲 Create Random Room
      </button>

      

      {!savedName && ( //here
        <button className="secondary-button" onClick={toSigninPage}>
          Go to Sign In Page
        </button>
      )}
    </div>

    <div className="hero">
      <h1>Play Multiplayer Biblios Online</h1>
      <p>Draft, bid, and battle for knowledge in this browser version of the classic card game Biblios.</p>
      
    </div>
  </main>

  {rulesPage && <RulesPage onClose={() => setRulesPage(false)} />}
</div>



  );
};

export default Home;
