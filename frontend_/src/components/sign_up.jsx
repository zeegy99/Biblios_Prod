import React, { useState } from "react";
import "./sign_in.css"; 
import { useNavigate, Link } from "react-router-dom";

const Signup = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("❌ Passwords do not match.");
      return;
    }

    // Proceed with sign-up logic
    alert(`Signed up as ${username} (${email})`);
    navigate("/signin"); // Redirect to sign-in page
  };

  return (
    <div className="signin-signup">
      <form className="sign-in-form" onSubmit={handleSubmit}>
        <h2 className="title">Sign Up</h2>

        <div className="input-field">
          <i className="fas fa-user"></i>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="input-field">
          <i className="fas fa-envelope"></i>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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

        <div className="input-field">
          <i className="fas fa-lock"></i>
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {error && <p style={{ color: "red", marginBottom: "10px" }}>{error}</p>}

        <input type="submit" value="Sign Up" className="btn solid" />

        <p className="social-text">
          Already have an account?{" "}
          <Link to="/signin" style={{ color: "red" }}>Sign in</Link>
        </p>
      </form>
    </div>
  );
};

export default Signup;
