import React, { useState, useEffect, useRef } from "react";
import Card from "./card";
import "./card.css";
import Timer from "../timer.jsx";
import Bot from "./bot.js";
import {updatedSettings} from "./settings.jsx";

const DonationPhase = ({
  player,
  players,
  isCurrentPlayer,
  deck,
  setDeck,
  setDiscardPile,
  discardPile,
  sharedPool,
  setSharedPool,
  setPlayers,
  broadcastState,
  onFinish,
  totalPlayers,
  currentPlayerIndex,
  phase,
}) => {


  
  const numToDraw = 2 + (totalPlayers - 1);
  const [cardsToProcess, setCardsToProcess] = useState([]);
  const [kept, setKept] = useState(null);
  const [discarded, setDiscarded] = useState(null);
  const [shared, setShared] = useState([]);
  const [donationDeck, setDonationDeck] = useState(deck);
  const hasDrawn = useRef(false);
  const handledSpecialCards = useRef(new Set());
  const [specialCardToPlay, setSpecialCardToPlay] = useState(null);
  const [drawnCount, setDrawnCount] = useState(0); // counts non-specials
  const isFirstRender = useRef(true);
  const hasConfirmed = useRef(false);

  //Dice UI
  const [diceToModify, setDiceToModify] = useState(null);
  const [diceSelectionCard, setDiceSelectionCard] = useState(null);
  const [diceChosen, setDiceChosen] = useState(new Set());

  
  //For my <Timer/>
  const specialCardRef = useRef(null);
  useEffect(() => {
    specialCardRef.current = specialCardToPlay;
  }, [specialCardToPlay]);

  //Resolving Special Dice Cards: 
  const playSpecialCard = (card) =>
  {
 

    
    const prevState = JSON.parse(localStorage.getItem("last_game_state"));
    const diceClone = prevState?.dice ? [...prevState.dice.map(d => ({ ...d }))] : [];

    if (card.type === "Both") {
      setDiceSelectionCard(card);
      return;
    }

    setDiceToModify(diceClone);        
    setDiceSelectionCard(card);      
    setDiceChosen(new Set());         
  };

//For SpecialCards
useEffect(() => {
  const isDone = kept && discarded && shared.length === totalPlayers-1;
  if (isDone && !hasConfirmed.current) {
    confirmTurn();
    hasConfirmed.current = true;
  }
}, [kept, discarded, shared]);

 useEffect(() => 
{
  if (!specialCardToPlay || !isCurrentPlayer) return;

  const card = specialCardToPlay;

  setTimeout(() => {
    playSpecialCard(card);
  }, 300);
}, [specialCardToPlay, isCurrentPlayer]);





useEffect(() =>
{
  if (phase !== "donation") return;
  hasDrawn.current = false;
 
}, [phase, player.name]);


  //For DrawingCards
useEffect(() => 
{
  
   if (phase !== "donation" || !isCurrentPlayer) {

    return;
   }

  if (hasDrawn.current || drawnCount > 0) {
    console.warn(`🛑 Skipping draw for ${player.name}: already drawn`);
    return;
  }

 
  hasDrawn.current = true;




  const updatedDeck = [...deck];
  const drawn = [];

  while (drawn.length < numToDraw && updatedDeck.length > 0) 
  {
    const card = updatedDeck.pop();

    if (card.isSpecial) 
    {
      handledSpecialCards.current.add(card); 
      continue; 
    }

    drawn.push(card);
  }
  setDrawnCount(drawn.length);
 
  setDeck(updatedDeck);
  setDonationDeck(updatedDeck);
  setCardsToProcess(drawn.reverse());
  broadcastState({ deck: updatedDeck });

  if (drawn.length < numToDraw) {
    console.warn("Not enough non-special cards — skipping to auction");
    broadcastState({ phase: "auction" });
    return;
  }

  const specialsArray = [...handledSpecialCards.current];
  if (specialsArray.length > 0) {
    const [first, ...rest] = specialsArray;
    setSpecialCardToPlay(first);
    handledSpecialCards.current = new Set(rest);
  }
}, [phase, isCurrentPlayer]);



  //Card Actions

  const handleChoice = (card, action) => 
  {
    if (specialCardToPlay || diceSelectionCard || diceToModify) {
    console.warn("🛑 Cannot assign cards during special card resolution");
    return;
    
    }
    console.log("keybind check")
    if (action === "keep") 
    {
      if (kept) return alert("You've already kept a card.");
      setKept(card);

      broadcastState
      ({
        donationAction: 
        {
          player: player.name,
          action: "kept",
        },
      })
    } 
    else if (action === "discard") 
    {
      if (discarded) return alert("You've already discarded a card.");
      setDiscarded(card);

      broadcastState
      ({
        donationAction: 
        {
          player: player.name,
          action: "discarded",
        },
      })

      
    } 
    else if (action === "pool") 
      
    {
      if (shared.length >= numToDraw - 2)
        return alert("Too many shared cards.");

      const newShared = [...shared, card];
      const pooledCard = { ...card, pooledBy: player.name };
      const updatedSharedPool = [...sharedPool, pooledCard];

      setShared(newShared);
      setSharedPool(updatedSharedPool); 

      broadcastState({
        sharedPool: updatedSharedPool,
        donationAction: {
          player: player.name,
          action: "pooled",
          card: pooledCard,
        },
      });
    }

    setCardsToProcess((prev) => prev.slice(1));
  };

  const confirmTurn = () => {
  if (!kept || !discarded || shared.length !== numToDraw - 2) {
    alert("You must assign all cards.");
    return;
  }
  



  // Create all updates first
  const updatedPlayers = players.map((p) =>
    p.name !== player.name
      ? p
      : {
          ...p,
          hand: [...p.hand, kept],
          gold: p.gold + (kept.type === "Gold" ? kept.value : 0),
        }
  );

  const updatedDiscard = [...discardPile, discarded];
  const updatedShared = [...sharedPool];
  const lastDonatorIdx = players.findIndex(p => p.name === player.name);

  

  onFinish({
    updatedDiscard,
    updatedShared,
    updatedPlayers,
  });
  

  broadcastState({
    discardPile: updatedDiscard,
    sharedPool: updatedShared,
    players: updatedPlayers,
    deck: donationDeck,
    lastDonatorIndex: lastDonatorIdx,
    phase: "shared_selection",
    sharedSelectionIndex: (currentPlayerIndex + 1) % totalPlayers,
    currentPlayerIndex: (currentPlayerIndex + 1) % totalPlayers
  });

  // Reset local state
  setKept(null);
  setDiscarded(null);
  setShared([]);
  setCardsToProcess([]);
  setDrawnCount(0);
  
};

  const currentCard = cardsToProcess[0];

  //Keybinds
  useEffect(() => {
  if (!isCurrentPlayer) return;

 
  if (diceToModify && diceSelectionCard) {
    console.log("I am in here")
    const handleDiceKey = (event) => {
      
      const keyIndex = parseInt(event.key, 10) - 1;
      console.log("I am keyIndex", keyIndex)

      // Check if the key is a valid number and corresponds to an existing die
      if (
        !isNaN(keyIndex) &&
        keyIndex >= 0 &&
        keyIndex < diceToModify.length
      ) {
        // Find the dice button and simulate a click
        const diceButton = document.querySelector(
          `button[data-dice-index='${keyIndex}']`
        );
        if (diceButton) {
          diceButton.click();
        }
      }
    };

    window.addEventListener("keydown", handleDiceKey);

    return () => {
      window.removeEventListener("keydown", handleDiceKey);
    };
  }
  // Keybinds for card choices
  else if (currentCard) {
    const handleKeep = (event) => {
      if (
        event.key === String(updatedSettings["KEEP_CARD"]).toLowerCase()
      ) {
        handleChoice(currentCard, "keep");
      }
    };
    const handleDiscard = (event) => {
      if (
        event.key ===
        String(updatedSettings["DISCARD_CARD"]).toLowerCase()
      ) {
        handleChoice(currentCard, "discard");
      }
    };
    const handlePool = (event) => {
      if (
        event.key ===
        String(updatedSettings["DONATE_CARD"]).toLowerCase()
      ) {
        handleChoice(currentCard, "pool");
      }
    };

    window.addEventListener("keydown", handleKeep);
    window.addEventListener("keydown", handleDiscard);
    window.addEventListener("keydown", handlePool);

    return () => {
      window.removeEventListener("keydown", handleKeep);
      window.removeEventListener("keydown", handleDiscard);
      window.removeEventListener("keydown", handlePool);
    };
  }
}, [isCurrentPlayer, updatedSettings, handleChoice, currentCard, diceToModify, diceSelectionCard]);


 




  return (
  <div>
    <h3>{players[currentPlayerIndex]?.name}'s Donation Turn</h3>

    {/* 🟡 Everyone sees the special card banner */}
    {specialCardToPlay && (
      <div >
        <h4 style={{ textAlign: "center" }}>💫 Special Card Drawn!</h4>
        <Card {...specialCardToPlay} />
      </div>
    )}

    {/* 🟣 Both card choice */}
    {diceSelectionCard?.type === "Both" && !diceToModify && (
      <div style={{ marginTop: "20px", border: "2px solid violet", padding: "10px", borderRadius: "10px" }}>
        <h4>💫 You drew a Both card ({diceSelectionCard.value})</h4>
        <p>Choose how you'd like to use it:</p>
        {isCurrentPlayer ? (
          <>
            <button style={{ marginRight: "10px" }} onClick={() => playSpecialCard({ ...diceSelectionCard, type: "Plus" })}>
              ➕ Increase
            </button>
            <button onClick={() => playSpecialCard({ ...diceSelectionCard, type: "Minus" })}>
              ➖ Decrease
            </button>
          </>
        ) : (
          <p style={{ color: "gray" }}>Waiting for {player.name} to choose...</p>
        )}
      </div>
    )}

    {/* 🎲 Dice resolution UI */}
    {diceToModify && diceSelectionCard && (
      <div style={{ marginTop: "20px", border: "2px dashed gray", padding: "10px", borderRadius: "10px" }}>
        <h4>
          🎲 Modify Dice — {diceSelectionCard.type === "Plus" ? "+" : "-"}
          {diceSelectionCard.value}
        </h4>
        {!isCurrentPlayer && (
          <p style={{ color: "gray", marginBottom: "10px" }}>
            ⏳ Waiting for {player.name} to select dice...
          </p>
        )}
        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
          {diceToModify.map((die, i) => (
            <div key={i} style={{ border: "1px solid #ccc", padding: "10px", borderRadius: "8px", textAlign: "center", minWidth: "80px" }}>
              <div style={{ fontWeight: "bold" }}>{die.resource_type}</div>
              <div style={{ fontSize: "24px", margin: "6px 0" }}>{die.value}</div>
              <button
                disabled={!isCurrentPlayer || diceChosen.has(i)}
                onClick={() => {
                  if (!isCurrentPlayer) return;

                  const updated = [...diceToModify];
                 

                  updated[i].value = diceSelectionCard.type === "Plus"
                    ? Math.min(6, updated[i].value + 1)
                    : Math.max(1, updated[i].value - 1);

                  

                  const nextChosen = new Set(diceChosen);
                  nextChosen.add(i);
                  setDiceToModify(updated);
                  setDiceChosen(nextChosen);

                  const needed = diceSelectionCard.value === 2 ? 2 : 1;
                  if (nextChosen.size === needed) {

                    const changeDetails = [...nextChosen].map(i => {
                      const resource = diceToModify[i].resource_type;
                      
                      const newVal = updated[i].value;

                      const oldVal = diceSelectionCard.type == "Plus" ? newVal - 1 : newVal + 1
                      return `${resource}: ${oldVal} → ${newVal}`;
                    });

                    broadcastState({ dice: updated }, `${player.name} modified the dice. They changed: ${changeDetails.join(", ")}`);
                    // setSpecialCardToPlay(null);
                    setDiceToModify(null);
                    setDiceSelectionCard(null);
                    setDiceChosen(new Set());
                    setCardsToProcess((prev) => prev.filter((c) => c !== diceSelectionCard));

                     // Remove current special from cardsToProcess
                    setCardsToProcess((prev) => prev.filter((c) => c !== diceSelectionCard));

                    // Queue next special
                    const remaining = [...handledSpecialCards.current];
                    if (remaining.length > 0) {
                      const [next, ...rest] = remaining;
                      setSpecialCardToPlay(next);
                      handledSpecialCards.current = new Set(rest);
                    } else {
                      setSpecialCardToPlay(null);
                    }
                  }
                }}
              >
                {diceSelectionCard.type === "Plus" ? "➕" : "➖"}
              </button>
            </div>
          ))}
        </div>
      </div>
    )}

   
    {isCurrentPlayer && (
      <>
        {currentCard ? (
          <div>
            <h4>Choose what to do with this card:</h4>

            {/* Temporarily keeping the cards on the left*/}
                <div >
      <Card {...currentCard} />
    </div>
            <div
  style={{
    display: "flex",
    justifyContent: "center", 
    gap: "10px",              
    marginTop: "10px"
  }}
>
  <button
    onClick={() => handleChoice(currentCard, "keep")}
    disabled={specialCardToPlay || diceSelectionCard || diceToModify}
  >
    Keep
  </button>



  <button
    onClick={() => handleChoice(currentCard, "discard")}
    disabled={specialCardToPlay || diceSelectionCard || diceToModify}
  >
    Discard
  </button>

  <button
    onClick={() => handleChoice(currentCard, "pool")}
    disabled={specialCardToPlay || diceSelectionCard || diceToModify}
  >
    Pool
  </button>
</div>

          </div>
        ) : (
          <div>
            <p>
              You kept: {kept?.type} {kept?.value}
            </p>
            <p>
              You discarded: {discarded?.type} {discarded?.value}
            </p>
            <p>
              Shared cards:{" "}
              {shared.map((c, i) => `${c.type} ${c.value}`).join(", ")}
            </p>
            {/* {confirmTurn()} */}
            {/* <button onClick={confirmTurn}>Confirm Turn</button> */}
            
          </div>
        )}
      </>
    )}

    <div
  style={{
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: "60px", // spacing between card back and shared cards
    marginTop: "40px",
  }}
>
  

  {/* Shared cards + label */}
  <div>
    <h3>🫱 Shared Cards</h3>

    

    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
      
      {sharedPool.map((card, idx) => (
        <div key={idx} style={{ textAlign: "center" }}>
          <Card card={card} />
          <p style={{ fontSize: "0.9em", color: "gray" }}>
            Pooled by {card.pooledBy || "?"}
          </p>
          
        </div>
        
      ))}
      {/* Biblios card back (only for non-current player) */}
  {!isCurrentPlayer && (
    <div style={{ textAlign: "center" }}>
      <Card card={currentCard} startflipped={true} />
    </div>
  )}
    </div>
    
  </div>
</div>

{isCurrentPlayer && (
    //Timer is a work in progress 
        <Timer
  duration={30000}
  onTimeout={() => {
    console.log(`${player.name} ran out of time!`);

    
  }}
  small_duration={true}
/>

  )}
  </div>
);

};

export default DonationPhase;