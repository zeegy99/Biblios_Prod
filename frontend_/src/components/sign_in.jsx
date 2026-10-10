import React, { useState } from "react";

import "./sign_in.css";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth_context";
import { useInRoom, IN_ROOM_MESSAGE } from "../use_in_room";

const SigninPage = () => {
  const { refresh } = useAuth();
  // Sign-in isn't offered while the player holds a seat in a Room.
  const inRoom = useInRoom();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();


//Handling Login-Information. As of 9/8/26 Looks Good
  const handleSignin = async (e) => {
    e.preventDefault();
    if (inRoom) return;
    console.log("1 starting login process")
    try {
      const res = await fetch("/api/signin", {
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
      console.log("3.1 Document cookies after login:", document.cookie);

      if (res.ok) {
        console.log("4. Res is ok")

        // The new Session is now set; let the auth provider ask who we are.
        await refresh();

        localStorage.setItem("playerName", username);
        navigate("/signedin");
      } else {
        alert("Login failed: " + data.error);
      }
    } catch (err) {
      console.error("Network error:", err);
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

        {inRoom && <p className="login-label">{IN_ROOM_MESSAGE}</p>}

        <button type="submit" className="login-button" disabled={inRoom}>
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
