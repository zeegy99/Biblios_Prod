import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/home.jsx";
import Lobby from "./components/lobby.jsx";
import Play from "./components/play_component.jsx";
import SigninPage from "./components/sign_in.jsx";
import Signup from "./components/sign_up.jsx";
import socket from "./socket";

function App() {
  const [playerName, setPlayerName] = useState(() => {
  return localStorage.getItem("playerName") || "";
});
  const [playerList, setPlayerList] = useState([]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home setPlayerName={setPlayerName} />} />
       <Route path="/lobby" element={<Lobby playerName={playerName} setPlayerName={setPlayerName} setPlayerList={setPlayerList} />} />
        <Route path="/game/:room" element={<Play playerName={playerName} playerList={playerList} />} />
        <Route path="/signin" element={<SigninPage />} />
        <Route path="/signup" element={<Signup/>} />
        
      </Routes>
    </Router>
  );
}

export default App;
