import React from "react";
import { useParams } from "react-router-dom";
import Card from "./card";
import "./card.css";
import socket from "../socket";

// The shared selection phase of a server-rules Game, rendered only from this
// Seat's Player View. It holds no rules: a Take button is enabled exactly
// when the Player View lists that take as a legal Move, and clicking it sends
// that Move.
const ServerSharedSelection = ({ view }) => {
  const { room } = useParams();
  const { seats, legal_moves: legalMoves } = view;
  const selector = seats[view.current_seat]?.name;
  const isSelector = view.current_seat === view.you;

  const takeMove = (idx) => legalMoves.find((m) => m.type === "take" && m.card === idx);

  return (
    <div>
      <h3>
        {isSelector
          ? `${selector}'s Turn - Shared Pool Selection`
          : `Shared Pool by ${seats[view.last_donor]?.name} (watching selection)`}
      </h3>
      {isSelector ? <p>Select a card:</p> : <p>⏳ Waiting for {selector} to choose a card...</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center", alignItems: "center" }}>
        {view.shared_pool.map((card, idx) => {
          const move = takeMove(idx);
          return (
            <div key={idx} style={{ textAlign: "center" }}>
              <Card card={card} />
              <p style={{ fontSize: "0.9em", color: "gray" }}>Pooled by {card.pooledBy || "?"}</p>
              {isSelector && (
                <button disabled={!move} onClick={() => move && socket.emit("move", { room, move })}>
                  Take
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ServerSharedSelection;
