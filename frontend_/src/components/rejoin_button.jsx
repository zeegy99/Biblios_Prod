import React from "react";

// Placeholder until Rejoin works by server-assigned Player Identity (#16).
const noGameToRejoin = () => {
  alert("No game to rejoin.");
};

// The red Rejoin button in each screen's header.
const RejoinButton = ({ onClick = noGameToRejoin }) => (
  <button
    className="login-header"
    style={{ backgroundColor: "#e53935", color: "white" }}
    onClick={onClick}
  >
    Rejoin
  </button>
);

export default RejoinButton;
