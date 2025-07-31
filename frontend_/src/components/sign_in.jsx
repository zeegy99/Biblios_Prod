import React from "react";
import "./sign_in.css";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

const SigninPage = () => {
  const handleLogin = (e) => {
    e.preventDefault();
    alert("Message from Developer \n Thanks! for Visiting Here");
  };

  return (
    <div className="signin-signup">
      <form className="sign-in-form" onSubmit={handleLogin}>
        <h2 className="title">Sign in</h2>
        <div className="input-field">
          <i className="fas fa-user"></i>
          <input type="text" placeholder="Username or Email" required />
        </div>
        <div className="input-field">
          <i className="fas fa-lock"></i>
          <input type="password" placeholder="Password" required />
        </div>
        <input type="submit" value="Login" className="btn solid" />
        
        <div className="social-media">
          
        </div>
        <p className="social-text">
          New here? <Link to="/signup" style={{ color: "red" }}>Sign Up</Link>
        </p>
      </form>
    </div>
  );
};

export default SigninPage;