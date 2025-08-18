import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RulesPage from "./rulespage";
import "./leaderboard.css";

const ForgotPassword = () => {
  const login_info = localStorage.getItem("signin_username") || "none";
  const savedName = localStorage.getItem("playerName");
  const [elo, setElo] = useState(null);
  const isGuest = localStorage.getItem("isGuest") === "true";
  const navigate = useNavigate();
  const [showBox, setShowBox] = useState(false);
  const [rulesPage, setRulesPage] = useState(false);
  const [players, setPlayers] = useState([]);
  const [email, setEmail] = useState("");

  
  const checkemail = async () => {
    const e = email.trim().toLowerCase();
    if (!e) {
      console.log("blocked")
      return
    }
   
    console.log("This is email", e)
    const res = await fetch("https://biblios-backend.onrender.com/api/check_email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e })
      })
    console.log("I finished running", res)
  };

  

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

 

  return (
    <div className="leaderboard-page" style={{marginTop: "40px"}}>
      <header className="home-header">
        <div className="logo">BIBLIOS</div>
        <div className="nav-buttons">
          <button
            className="login-header"
            style={{ backgroundColor: "#e53935", color: "white" }}
            
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

      Please enter your email associated with the account:  
      <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            }}
          className="login-input"
          required
        />

    <button onClick={checkemail}>
        Send email {email}
    </button>

      
    </div>
  );
};

export default ForgotPassword;
