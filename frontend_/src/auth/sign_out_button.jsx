import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth_context";
import { useInRoomGuard } from "../use_in_room";

// The Sign Out button used in every profile dropdown.
// Disabled while the player is in a Room.
const SignOutButton = ({ style }) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const inRoomGuard = useInRoomGuard();

  const handleSignOut = async () => {
    if (inRoomGuard.disabled) return;
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign-out failed:", error);
      alert("Could not sign out. Please try again.");
    }
  };

  return (
    <button
      className="profile-signout"
      style={style}
      onClick={handleSignOut}
      {...inRoomGuard}
    >
      Sign Out
    </button>
  );
};

export default SignOutButton;
