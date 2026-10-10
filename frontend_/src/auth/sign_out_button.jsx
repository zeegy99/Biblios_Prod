import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth_context";

// The Sign Out button used in every profile dropdown.
const SignOutButton = ({ style }) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign-out failed:", error);
      alert("Could not sign out. Please try again.");
    }
  };

  return (
    <button className="profile-signout" style={style} onClick={handleSignOut}>
      Sign Out
    </button>
  );
};

export default SignOutButton;
