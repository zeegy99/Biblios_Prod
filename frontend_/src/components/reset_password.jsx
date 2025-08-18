import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RulesPage from "./rulespage";
import "./leaderboard.css";
import "./sign_in.css"; 
import "./overall_css.css"

const ResetPassword = () => {
  const login_info = localStorage.getItem("signin_username") || "none";
  const savedName = localStorage.getItem("playerName");
  const [elo, setElo] = useState(null);
  const isGuest = localStorage.getItem("isGuest") === "true";
  const navigate = useNavigate();
  const [showBox, setShowBox] = useState(false);
  const [rulesPage, setRulesPage] = useState(false);
  const [players, setPlayers] = useState([]);
  const [email, setEmail] = useState("");
  const [changedPassword, setchangedPassword] = useState("");
  const [confirmchangedPassword, setconfirmchangedPassword] = useState("");
  const [code, setCode] = useState("");
  const [display, setdisplay] = useState(false);

  const confirmPasswordChange = async () => {
    if (changedPassword === confirmchangedPassword) {
      console.log("done")
      //send something to api pisser 
      const res = await fetch ("https://biblios-backend.onrender.com/api/change_password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: changedPassword, code: code })
      })

      if (res.ok) {
        setdisplay(true)
      }
    }
    else {
      alert("passwords don't match ")
      // make this be a popup instead of an alert
    }

    

  }
  
  

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

    <label className="login-label">Password</label>
        <input
          type="password"
          placeholder="Password"
          onChange = {(e) => setchangedPassword(e.target.value)}
          className="login-input"
          required
        />

        <label className="login-label">Confirm Password</label>
        <input
          type="password"
          placeholder="Confirm Password"
          onChange = {(e) => setconfirmchangedPassword(e.target.value)}
          className="login-input"
          required
        />

         <label className="login-label">Enter the code received</label>
        <input
          type="password"
          placeholder="Code"
          onChange = {(e) => setCode(e.target.value)}
       
          className="login-input"
          required
        />

        <button onClick={confirmPasswordChange}>Confirm</button>


         {display && (
         
          <div className="popup">
            <h2>Successful</h2>
            <p> Your password is now changed</p>
          </div>
          
          
         )}


    </div>

    

    

    
  );
};

export default ResetPassword;
