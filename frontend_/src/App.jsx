import React, { useState } from "react";
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
// import 'bootstrap/dist/css/bootstrap.min.css';

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
        <Route path="/signedin" element={<SignedIn />} />
        <Route path="/leaderboard" element={<LeaderBoard/>} />
        <Route path="/settings" element={<Settings/>} />
        <Route path="/forgot_password" element={<ForgotPassword/>} />
        <Route path="/reset-password/<token>" element={<ResetPassword/>} />
      </Routes>
    </Router>
  );
}

export default App;
