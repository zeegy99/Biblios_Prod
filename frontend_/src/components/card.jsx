import React, { useState } from "react";
import "./card.css";

const typeColors = {
  Religion: "#a67c52",
  Science: "#5b9bd5",
  Military: "#c0504d",
  Art: "#70ad47",
  Herbs: "#9e480e",
  Gold: "#ffd700",
};

const Card = (props) => {
  const { card: cardProp, startflipped = false } = props;
  const [flipped, setFlipped] = useState(false);
  const card = props.card ?? props;

  if (!card) return null;

  const { value, type, tieBreaker, isSpecial } = card;

  const backgroundColor = isSpecial
      ? "#b266ff"
    : typeColors[type] || "#fff";

  const isFlipped = startflipped || flipped;

   return (
  <div className="container" onClick={() => {
    if (!startflipped) setFlipped(!flipped);
  }}>
    <div className="card-wrapper">
      <div className="card-hover-info">
        {type} — Value: {value}
      </div>

      <div className={`card ${isFlipped ? "flipped" : ""} ${type?.toLowerCase()}`}>
        <div className="front">
          <div style={{ backgroundColor, padding: "10px", borderRadius: "8px" }}>

            {isSpecial && ["Plus", "Minus", "Both"].includes(type) ? (
  <img
   src={`/dice_cards/dice_${type === "Plus" ? value : type === "Minus" ? -value : "0"}.png`}
    alt={`${type} Modifier`}
    style={{
      width: "100%",
      height: "100%",
      objectFit: "cover",
      borderRadius: "8px"
    }}
    onError={(e) => {
      console.warn(`Missing dice image for ${type}:`, e.target.src);
      e.target.style.display = "none";
    }}
  />
) : (
  ["Religion", "Science", "Military", "Herbs", "Art", "Gold"].includes(type) ? (
    <img
      src={`/${type.toLowerCase()}_cards/${type.toLowerCase()}_${value}.png`}
      alt={`${type} ${value}`}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: "8px"
      }}
      onError={(e) => {
        console.warn(`Missing image for ${type} ${value}:`, e.target.src);
        e.target.style.display = "none";
      }}
    />
  ) : (
    <>
      <h4>{type}</h4>
      <p>Value: {value}</p>
      {!isSpecial && <p>Tiebreaker: {tieBreaker}</p>}
    </>
  )
)}

          </div>
        </div>
        <div className="back">
          <h1></h1>
        </div>
      </div>
    </div>
  </div>
);

};

export default Card;
