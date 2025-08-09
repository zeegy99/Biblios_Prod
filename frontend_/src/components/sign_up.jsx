import React, { useState } from "react";
import "./sign_in.css"; 
import { useNavigate, Link } from "react-router-dom";

const Signup = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);

  const navigate = useNavigate();

  const handleSignup = async (e) => 
  {
    e.preventDefault();

     if (password !== confirmPassword) {
    setError("Passwords do not match");
    setShowError(true);

    setTimeout(() => setShowError(false), 3000);
    return; 
  }

  setError(""); 
  setShowError(false);
    try {``
      const res = await fetch("https://biblios-backend.onrender.com/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          username,
          password
        })
      });


      const data = await res.json();

      if (res.ok) {
        navigate("/signin");
        setUsername("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setError("");
      } else {
        alert("Registration failed: " + data.error);
      }
    } catch (err) {
      console.error("Network error:", err);
      alert("Something went wrong.");
    }
};


  return (
    <>
    <div className="login-page">
      <div className="login-card">
        <h2 className="login-title">Sign Up</h2>
        <form onSubmit={handleSignup} className="login-form">

        <label className="login-label">Username</label>
<input
  type="text"
  value={username}
  onChange={(e) => {
    const value = e.target.value;
    setUsername(value);

    if (value.length > 16) {
      setError("Username cannot exceed 16 characters");
      setShowError(true);
    } else {
      setError("");
      setShowError(false);
    }
  }}
  className="login-input"
  required
/>

        <label className="login-label">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="login-input"
          required
        />

        <label className="login-label">Password</label>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="login-input"
          required
        />

        <label className="login-label">Confirm Password</label>
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="login-input"
          required
        />

        <div className={`error-container ${showError ? "visible" : ""}`}>
  {showError && <p className="error-text">{error}</p>}
</div>



         <button type="submit" className="login-button">
          Sign up
        </button>

        </form>

        <div className="signup-link">
                Already have an account? <Link to="/signin">Sign In</Link>
              </div>






      </div>
    </div>
      
        
    </>
  );
};

export default Signup;
