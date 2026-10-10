import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth_context";
import SignOutButton from "../auth/sign_out_button";
import RulesPage from "./rulespage";
import "./leaderboard.css";

const ForgotPassword = () => {
  const { username, isSignedIn } = useAuth();
  const savedName = localStorage.getItem("playerName");
  const [elo, setElo] = useState(null);
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
    const res = await fetch("/api/check_email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e })
      })
    console.log("I finished running", res)
  };

  

  useEffect(() => {
    if (isSignedIn) {
      fetch("/api/get_elo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() })
      })
        .then(res => res.json())
        .then(data => setElo(data.elo ?? "N/A"))
        .catch(() => setElo("Error"));
    }
  }, [isSignedIn, username]);

 

  return (
    <div className="leaderboard-page" >
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

          {showBox && isSignedIn && (
            <div className="profile-dropdown">
              <p className="profile-label" style={{marginLeft: "50px"}}>You are logged in as:</p>
              <h3 className="profile-name">{username}</h3>
              
              <hr className="profile-divider" />
              <SignOutButton style={{marginLeft: "30px"}} />
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
