import React from "react";
import Card from "./card";
import {useEffect} from "react";
import Timer from "../timer.jsx";
import Bot from "./bot.js";


const SharedPoolSelection = ({
  players,
  sharedPool,
  setSharedPool,
  setPlayerHands,
  setPlayerGold,
  onFinish,
  setPlayers,
  broadcastState,
  sharedSelectionIndex,
  lastDonatorIndex,
  playerName,
  phase,
}) => {





  
  const player = players[sharedSelectionIndex];
  const currentSelector = players[sharedSelectionIndex];
  const isCurrentPlayer = currentSelector?.name === playerName;

  const handleChoice = (choiceIdx) => {
  if (!isCurrentPlayer) {
    console.warn("⛔ Not your turn. Ignoring input.");
    return;
  }

  const chosenCard = sharedPool[choiceIdx];
  if (!chosenCard) {
    console.warn("❌ Card already taken or stale click");
    return;
  }



  const newPool = [...sharedPool];
  newPool.splice(choiceIdx, 1);

  const updatedPlayers = players.map((p, i) => {
    if (i !== sharedSelectionIndex) return p;
    return {
      ...p,
      hand: [...p.hand, chosenCard],
      gold: p.gold + (chosenCard.type === "Gold" ? chosenCard.value : 0),
    };
  });

  const next = (sharedSelectionIndex + 1) % players.length;

  // Apply state updates immediately
  setSharedPool(newPool);
  setPlayers(updatedPlayers);

  setTimeout(() => {
    const sharedSelectionState = {
      phase: "shared_selection",
      sharedPool: newPool,
      players: updatedPlayers,
      sharedSelectionIndex: next,
    };

    if (next === lastDonatorIndex) {
      broadcastState(sharedSelectionState);
      onFinish(); 
    } else {
      broadcastState(sharedSelectionState);
    }
  }, 0);
};


  useEffect(() => {
  if (!sharedPool.length && isCurrentPlayer) {
    onFinish(); 
  }
}, [sharedPool, isCurrentPlayer, onFinish]);

if (!sharedPool.length && !isCurrentPlayer) {
  return <p>Waiting for other players...</p>;
}

 return (
  <div>
    <h3>
      {isCurrentPlayer
        ? `${player.name}'s Turn - Shared Pool Selection`
        : `Shared Pool by ${players[sharedSelectionIndex]?.name} (watching selection)`}
    </h3>

    {!isCurrentPlayer && (
      <p>⏳ Waiting for {players[sharedSelectionIndex]?.name} to choose a card...</p>
    )}

    {sharedPool.length > 0 && (
      <>
        {isCurrentPlayer && <p>Select a card:</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center", alignItems: "center"}}>
          {sharedPool.map((card, idx) => (
            <div key={idx} style={{ textAlign: "center", opacity: card.taken ? 0.4 : 1 }}>
              <Card {...card} />
              <p style={{ fontSize: "0.9em", color: "gray" }}>
                Pooled by {card.pooledBy || "?"}
              </p>
              {isCurrentPlayer && !card.taken ? (
                <button onClick={() => handleChoice(idx)}>Take</button>
              ) : card.taken ? (
                <p style={{ color: "red", fontSize: "0.8em" }}>Taken</p>
              ) : null}
            </div>
          ))}
        </div>

         {isCurrentPlayer && (
    <Timer
      duration={10000}
      onTimeout={() => 
        {
        console.log(`A bot will be executing the action for ${player.name}`);
        const card = Bot.shared_selection({sharedPool})
        console.log("The bot randomly selected this card", card)

        setTimeout(() => {
          handleChoice(card)
        }, 0)
        
      }}
      small_duration={true}
    />
  )}
      </>
    )}
  </div>
);

};

export default SharedPoolSelection;