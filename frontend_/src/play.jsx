// src/pages/play.jsx
import React, { useState } from "react";

const Play = () => {
  const [phase, setPhase] = useState("auction");
  const [players, setPlayers] = useState(["Alice", "Bob"]);
  const [deck, setDeck] = useState([]); // for your Shoe class logic

  return (
    <div>
      <h1>Biblios Game</h1>
      <p>Current Phase: {phase}</p>
      <p>Some rando stuff?  </p>

      <button onClick={() => setPhase("donation")}>Next Phase</button>

      <div>
        {players.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
};

export default Play;

