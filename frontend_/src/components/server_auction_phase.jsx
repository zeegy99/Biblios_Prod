import React, { useState } from "react";
import { useParams } from "react-router-dom";
import Card from "./card";
import "./card.css";
import socket from "../socket";

// The auction of a server-rules Game, rendered only from this Seat's Player
// View. It holds no rules: Bid is enabled only when the Player View lists a
// bid range, the bid input is clamped to that range, Pass only when pass is
// listed, and each sends that Move.
const ServerAuctionPhase = ({ view }) => {
  const { room } = useParams();
  const { auction, seats, legal_moves: legalMoves } = view;
  const [bidInput, setBidInput] = useState("");

  const bidRange = legalMoves.find((m) => m.type === "bid");
  const passMove = legalMoves.find((m) => m.type === "pass");
  const bidder = seats[view.current_seat]?.name;
  const highest = auction.highest_bidder != null ? seats[auction.highest_bidder]?.name : "None";

  const clamp = (amount) => Math.min(bidRange.max, Math.max(bidRange.min, amount));
  const amount = bidRange ? clamp(parseInt(bidInput, 10) || bidRange.min) : null;

  const sendMove = (move) => socket.emit("move", { room, move });

  if (auction.winner) {
    const winner = seats[auction.winner.seat]?.name;
    return (
      <div style={{ textAlign: "center" }}>
        <h3>Auction</h3>
        <Card card={auction.winner.card} />
        <p>
          {auction.winner.seat === view.you ? "You win" : `${winner} wins`} the card for {auction.winner.bid}
          {auction.winner.card.type === "Gold" ? " card(s)" : " gold"}.
        </p>
        <p>⏳ Waiting for {winner} to pay...</p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <h3>Auction</h3>
      <p style={{ fontWeight: "bold", fontSize: "1.2rem" }}>👉 {bidder}'s turn to bid</p>
      <p>Bidding order: {auction.bidding_order.map((i) => seats[i]?.name).join(" → ")}</p>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Card card={auction.card} />
      </div>
      <p>
        Current Bid: {auction.bid} by {highest}
      </p>
      <p style={{ color: "gray" }}>
        Passed: {seats.filter((_, i) => !auction.active[i]).map((s) => s.name).join(", ") || "nobody"}
      </p>

      {(bidRange || passMove) && (
        <div>
          {bidRange && (
            <>
              <input
                type="number"
                min={bidRange.min}
                max={bidRange.max}
                placeholder={`${bidRange.min}–${bidRange.max}`}
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                onBlur={() => bidInput !== "" && setBidInput(String(amount))}
              />
              <button
                onClick={() => {
                  sendMove({ type: "bid", amount });
                  setBidInput("");
                }}
              >
                Bid {amount}
              </button>
            </>
          )}
          <button disabled={!passMove} onClick={() => passMove && sendMove(passMove)}>
            Pass
          </button>
        </div>
      )}
    </div>
  );
};

export default ServerAuctionPhase;
