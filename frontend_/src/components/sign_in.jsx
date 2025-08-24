import React, { useState } from "react";

import "./sign_in.css";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

const SigninPage = ({setPlayerName, setIsAuthenticated}) => {
  console.log("Props received", setPlayerName, setIsAuthenticated)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();



  const handleSignin = async (e) => {
    e.preventDefault();
    console.log("1 starting login process")
    try {
      const res = await fetch("https://biblios-backend.onrender.com/api/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password }),
        credentials: "include"
      });
       console.log("2. Login response status:", res.status);
      const data = await res.json();
       console.log("3. Login response data:", data);

      if (res.ok) {
        console.log("4. Res is ok")
        // I am going to rehaul this so that we don't need signin_usrename in localstorage. 
        const userResponse = await fetch('https://biblios-backend.onrender.com/api/current-user', {
        credentials: 'include'
      });

      console.log("5 userResponse", userResponse)
      if (userResponse.ok) {
        console.log("userResponse is ok")
      const userData = await userResponse.json();
      console.log("6 userData", userData)
      setPlayerName(userData.username);  
      console.log("7. SetPlayerName Issues")
      setIsAuthenticated(true);
    }

        localStorage.setItem("playerName", username);
        localStorage.setItem("isGuest", "false")
        localStorage.setItem("signin_username", username)
        navigate("/signedin");  
      } else {
        alert("❌ Login failed: " + data.error);
      }
    } catch (err) {
      console.error("❌ Network error:", err);
      alert("Something went wrong.");
    }
  };

  return (
  <div className="login-page">
    <div className="login-card">
      <h2 className="login-title">Log In</h2>
      <form onSubmit={handleSignin} className="login-form">
        <label className="login-label">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="login-input"
          required
        />

        <label className="login-label">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="login-input"
          required
        />

        <button type="submit" className="login-button">
          Log In
        </button>

        <div className="login-link">
          <Link to="/forgot_password">Forgot Password?</Link>
        </div>
      </form>

      <div className="signup-link">
        Need an account? <Link to="/signup">Sign Up</Link>
      </div>
    </div>
  </div>
);


};

export default SigninPage;
