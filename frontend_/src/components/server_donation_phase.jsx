import React from "react";
import { useParams } from "react-router-dom";
import Card from "./card";
import "./card.css";
import socket from "../socket";

// The donation phase of a server-rules Game, rendered only from this Seat's
// Player View. It holds no rules: a control is enabled exactly when the
// Player View lists the matching legal Move, and clicking it sends that Move.
const ServerDonationPhase = ({ view }) => {
  const { room } = useParams();
  const { donation, seats, legal_moves: legalMoves } = view;
  const isDonor = donation.donor === view.you;
  const donorName = seats[donation.donor]?.name;

  const legal = (type, extra = {}) =>
    legalMoves.find((m) => m.type === type && Object.entries(extra).every(([k, v]) => m[k] === v));

  const sendMove = (move) => socket.emit("move", { room, move });

  const moveButton = (label, type, extra) => {
    const move = legal(type, extra);
    return (
      <button key={label} disabled={!move} onClick={() => move && sendMove(move)}>
        {label}
      </button>
    );
  };

  return (
    <div>
      <h3>{donorName}'s Donation Turn</h3>

      {isDonor && donation.special && (
        <div style={{ marginTop: "20px", border: "2px dashed gray", padding: "10px", borderRadius: "10px" }}>
          <h4 style={{ textAlign: "center" }}>💫 Special Card Drawn!</h4>
          <Card card={donation.special} />
          {donation.special.type === "Both" && donation.direction === null ? (
            <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
              {moveButton("➕ Increase", "choose_direction", { direction: "plus" })}
              {moveButton("➖ Decrease", "choose_direction", { direction: "minus" })}
            </div>
          ) : (
            <div style={{ display: "flex", gap: "15px", flexWrap: "wrap", justifyContent: "center" }}>
              {view.dice.map((die, i) => (
                <div key={die.resource_type} style={{ border: "1px solid #ccc", padding: "10px", borderRadius: "8px", textAlign: "center", minWidth: "80px" }}>
                  <div style={{ fontWeight: "bold" }}>{die.resource_type}</div>
                  <div style={{ fontSize: "24px", margin: "6px 0" }}>{die.value}</div>
                  {moveButton(
                    (donation.special.type === "Minus" || donation.direction === "minus") ? "➖" : "➕",
                    "modify_die",
                    { die: i },
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isDonor && !donation.special && donation.card && (
        <div>
          <h4>Choose what to do with this card:</h4>
          <Card card={donation.card} />
          <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "10px" }}>
            {moveButton("Keep", "keep")}
            {moveButton("Discard", "discard")}
            {moveButton("Pool", "donate")}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: "60px", marginTop: "40px" }}>
        <div>
          <h3>🫱 Shared Cards</h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {view.shared_pool.map((card, idx) => (
              <div key={idx} style={{ textAlign: "center" }}>
                <Card card={card} />
              </div>
            ))}
            {!isDonor && donation.cards_count > 0 && (
              <div style={{ textAlign: "center" }}>
                <Card card={{}} startflipped={true} />
                <p style={{ fontSize: "0.9em", color: "gray" }}>{donation.cards_count} cards to donate</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerDonationPhase;
