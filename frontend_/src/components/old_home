import React, { useState } from "react";
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

  const toggleDropDown = () => {
    setShowBox((prev) => !prev);
  };

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
    setPlayerName(nameInput);
    navigate("/lobby");
  };

  const handleCreateRoom = () => {
    if (!nameInput) return alert("Enter your name first.");
    const newRoom = generateRoomCode();
    console.log(newRoom)
    localStorage.setItem("playerName", nameInput);
    localStorage.setItem("roomCode", newRoom);
    setPlayerName(nameInput);
    navigate("/lobby");
  };

  const toSigninPage = () => {
    navigate("/signin")
  }



  return (
    <div style={{ textAlign: "center", marginTop: "100px" }}>

      {savedName && <h3>Welcome back, {savedName}!</h3>}
      {savedName && <h3>Your elo is: {elo} lp</h3>}
      <div style={{ textAlign: "center", marginTop: "100px" }}>
      
     
  <h2>Start or Join a Game</h2>
 {!savedName && <input
    type="text"
    placeholder="Your Name"
    value={nameInput}
    onChange={(e) => setNameInput(e.target.value)}
  />}
  <br /><br />

  <input
    type="text"
    placeholder="Enter Room Code"
    value={roomInput}
    onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
  /><br /><br />

  <button onClick={handleJoin}>Join Room</button>
</div>

      <hr style={{ width: "200px", margin: "30px auto" }} />

      <button onClick={handleCreateRoom}>🎲 Create Random Room</button>

      {!savedName && <button onClick={toSigninPage}>Go To Sign In Page </button>

      }

      <div className="button-bar">
  <button className={'menu-button'}>Button</button>

  <button className={'menu-button'} onClick={() => setRulesPage(true)}>
  Rules
</button>

  <button className={'naming-button'} onClick={toggleDropDown}>
    {nameInput || "Guest"}
  </button>
</div>

{showBox && (
  <div className={'dropdown-box'}>
    <p className="nickname">Nickname</p>

    {localStorage.getItem("playerName") ? (
      <>
        <p className="nickname-display">{localStorage.getItem("playerName")}</p>
        <button
          className="normal-button"
          onClick={() => {
            localStorage.removeItem("playerName");
            localStorage.removeItem("elo");
            window.location.reload(); // or navigate to "/signin"
          }}
        >
          Sign Out
        </button>
      </>
    ) : (
      <>
        <input
          className="nickname-input"
          type="text"
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          placeholder="Enter your nickname"
        />
        <br />
        <button className={'normal-button'} onClick={updateName}>
          Update your nickname
        </button>
      </>
    )}
  </div>
)}


      

{rulesPage && <RulesPage onClose={() => setRulesPage(false)} />}


    </div>
  );
};

export default Home;
