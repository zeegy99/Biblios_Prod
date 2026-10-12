import React, { useState } from "react";
import { useParams } from "react-router-dom";
import Card from "./card";
import "./card.css";
import socket from "../socket";
import { DeadlineTimer } from "../timer.jsx";

// The auction of a server-rules Game, rendered only from this Seat's Player
// View. It holds no rules: Bid is enabled only when the Player View lists a
// bid range, the bid input is clamped to that range, Pass only when pass is
// listed, and each sends that Move. The winner pays by choosing cards from
// its own hand; Pay is shown only when the Player View lists a pay Move, and
// the server decides whether the chosen cards will do.
const ServerAuctionPhase = ({ view }) => {
  const { room } = useParams();
  const { auction, seats, legal_moves: legalMoves } = view;
  const [bidInput, setBidInput] = useState("");
  const [chosen, setChosen] = useState([]);

  const bidRange = legalMoves.find((m) => m.type === "bid");
  const passMove = legalMoves.find((m) => m.type === "pass");
  const payMove = legalMoves.find((m) => m.type === "pay");
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
        <DeadlineTimer deadline={view.deadline} />
        <Card card={auction.winner.card} />
        <p>
          {auction.winner.seat === view.you ? "You win" : `${winner} wins`} the card for {auction.winner.bid}
          {auction.pay_in === "cards" ? " card(s)" : " gold"}.
        </p>
        {payMove ? (
          <PaymentPicker
            hand={view.hand}
            payMove={payMove}
            chosen={chosen}
            setChosen={setChosen}
            onPay={() => {
              sendMove({ type: "pay", cards: chosen });
              setChosen([]);
            }}
          />
        ) : (
          <p>⏳ Waiting for {winner} to pay...</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <h3>Auction</h3>
      <DeadlineTimer deadline={view.deadline} />
      <p style={{ fontWeight: "bold", fontSize: "1.2rem" }}>👉 {bidder}'s turn to bid</p>
      <p>Bidding order: {auction.bidding_order.map((i) => seats[i]?.name).join(" → ")}</p>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Card card={auction.card} />
      </div>
      <p>
        Current Bid: {auction.bid} by {highest}
      </p>
      {auction.last_payment && <LastPayment payment={auction.last_payment} seats={seats} />}
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

// The winner's own hand, to choose the cards it pays with. What the payment
// must be comes from the pay Move's descriptor. Greying out cards that can't
// be chosen (the won Gold card; non-Gold cards for a gold payment) and the
// gold total are display aids only: the server checks the payment.
const PaymentPicker = ({ hand, payMove, chosen, setChosen, onPay }) => {
  const excluding = payMove.excluding || [];
  const unavailable = (i) => excluding.includes(i) || (payMove.pay_in === "gold" && hand[i].type !== "Gold");
  const toggle = (i) => setChosen((prev) => (prev.includes(i) ? prev.filter((c) => c !== i) : [...prev, i]));
  // Display aid: the gold the chosen cards come to.
  const goldChosen = chosen.reduce((sum, i) => sum + (hand[i]?.type === "Gold" ? hand[i].value : 0), 0);
  return (
    <div>
      <h4>
        {payMove.pay_in === "cards"
          ? `Choose exactly ${payMove.exactly} card(s) to give up (not the Gold card you won)`
          : `Choose Gold cards worth at least ${payMove.at_least} (no change is given)`}
      </h4>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
        {hand.map((card, i) => (
          <div
            key={i}
            onClick={() => !unavailable(i) && toggle(i)}
            style={{
              border: chosen.includes(i) ? "2px solid red" : "1px solid gray",
              margin: "5px",
              cursor: unavailable(i) ? "not-allowed" : "pointer",
              opacity: unavailable(i) ? 0.5 : 1,
            }}
          >
            <Card card={card} />
          </div>
        ))}
      </div>
      <p>
        Chosen: {chosen.length} card(s)
        {payMove.pay_in === "gold" && `, worth ${goldChosen} gold`}
      </p>
      <button onClick={onPay}>Pay</button>
    </div>
  );
};

// What every Seat is told about how the previous card was paid for: the
// cards given up for a Gold card (React posts them to the chat), or only the
// gold paid for any other card.
const LastPayment = ({ payment, seats }) => {
  const payer = seats[payment.seat]?.name;
  if (payment.cards) {
    return <p>{payer} gave up {payment.cards.map((c) => `${c.type} ${c.value}`).join(", ")} for the last card.</p>;
  }
  return (
    <p>
      {payer} paid {payment.gold} gold for the last card.
    </p>
  );
};

export default ServerAuctionPhase;
