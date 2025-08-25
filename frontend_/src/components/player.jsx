// src/components/PlayerBoard.jsx //
import React from "react";
import Card from "./card";

const PlayerBoard = ({ player, onPlayCard }) => {
  return (
    <div
      style={{
        border: "2px solid black",
        borderRadius: "8px",
        padding: "10px",
        margin: "10px",
      }}
    >
      <h3>{player.name}</h3>
      <p>Gold: {player.gold}</p>
      <p>Points: {player.points}</p>
      <h4>Hand:</h4>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {player.hand.map((card, i) => (
          <Card
            key={i}
            value={card.value}
            type={card.type}
            tieBreaker={card.tieBreaker}
            isSpecial={card.isSpecial}
            onClick={() => onPlayCard(player.name, i)}
          />
        ))}
      </div>
    </div>
  );
};

export default PlayerBoard;
