import React, { useState } from "react";
import "./sign_in.css";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

const SigninPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSignin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("https://biblios-backend.onrender.com/api/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("playerName", username);
        localStorage.setItem("elo", data.elo)
        navigate("/");  
      } else {
        alert("❌ Login failed: " + data.error);
      }
    } catch (err) {
      console.error("❌ Network error:", err);
      alert("Something went wrong.");
    }
  };

  return (
    <div className="signin-signup">
      <form className="sign-in-form" onSubmit={handleSignin}>
        <h2 className="title">Sign in</h2>
        <div className="input-field">
          <i className="fas fa-user"></i>
          <input
            type="text"
            placeholder="Username or Email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="input-field">
          <i className="fas fa-lock"></i>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <input type="submit" value="Login" className="btn solid" />

        <p className="social-text">
          New here? <Link to="/signup" style={{ color: "red" }}>Sign Up</Link>
        </p>
      </form>
    </div>
  );
};

export default SigninPage;
