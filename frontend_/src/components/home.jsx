import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";import { getOrCreatePlayerId } from "../utils/playerId";
import Timer from "../timer.jsx";


const generateRoomCode = () =>
  Math.random().toString(36).substring(2, 7).toUpperCase();

const playerId = getOrCreatePlayerId();


const Home = ({ setPlayerName }) => {
  const [nameInput, setNameInput] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const navigate = useNavigate();

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
      <div style={{ textAlign: "center", marginTop: "100px" }}>
  <h2>Start or Join a Game</h2>

  <input
    type="text"
    placeholder="Your Name"
    value={nameInput}
    onChange={(e) => setNameInput(e.target.value)}
  /><br /><br />

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

      <button onClick={toSigninPage}>Go To Signin Page </button>


    </div>
  );
};

export default Home;
