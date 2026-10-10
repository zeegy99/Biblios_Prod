import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/home.jsx";
import Lobby from "./components/lobby.jsx";
import Play from "./components/play_component.jsx";
import SigninPage from "./components/sign_in.jsx";
import Signup from "./components/sign_up.jsx";
import socket from "./socket";
import SignedIn from "./components/home_signedin.jsx";
import LeaderBoard from "./components/leaderboard.jsx";
import Settings from "./components/settings.jsx";
import ForgotPassword from "./components/forgot_password.jsx";
import ResetPassword from "./components/reset_password.jsx";
import { useAuth } from "./auth/auth_context";
// import 'bootstrap/dist/css/bootstrap.min.css';

function App() {
  const { username } = useAuth();
  const [playerName, setPlayerName] = useState("");
  const [playerList, setPlayerList] = useState([]);

  // A Signed-in Player's Display Name defaults to their account username, but only
  // when no Display Name is saved yet: a chosen alias survives sign-in. This is the
  // one place that sets that default.
  useEffect(() => {
    if (!username) return;
    let displayName = localStorage.getItem("playerName");
    if (!displayName) {
      displayName = username;
      localStorage.setItem("playerName", displayName);
    }
    setPlayerName(displayName);
  }, [username]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home setPlayerName={setPlayerName} />} />
       <Route path="/lobby" element={<Lobby playerName={playerName} setPlayerName={setPlayerName} setPlayerList={setPlayerList} />} />
        <Route path="/game/:room" element={<Play playerName={playerName} playerList={playerList} />} />
        <Route path="/signin" element={<SigninPage/>} />

        <Route path="/signup" element={<Signup/>} />

        <Route path="/signedin" element={<SignedIn/>} />

        <Route path="/leaderboard" element={<LeaderBoard/>} />
        <Route path="/settings" element={<Settings/>} />
        <Route path="/forgot_password" element={<ForgotPassword/>} />
        <Route path="/reset-password" element={<ResetPassword/>} />
      </Routes>
    </Router>
  );
}

export default App;
