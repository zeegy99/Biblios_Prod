import React, { useState, useEffect } from "react";
import { useRef } from "react";
import DonationPhase from "./donation_phase";
import AuctionPhase from "./auction_phase";
import ResultsScreen from "./results";
import ScoringPhase from "./scoring_phase";
import SharedPoolSelection from "./shared_selection";
import { buildDeck } from "./deck.jsx";
import { rollDice } from "../utils/setup";
import socket from "../socket";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import { useLocation } from "react-router-dom";
import "./lobby.css";
import PlayerHand from "./player_hand";


const GameRunner = ({ playerName }) => {
  // console.log("🧠 GameRunner mounted with playerName:", playerName);
  const hasSynced = useRef(false);
  const [auctionStarterIndex, setAuctionStarterIndex] = useState(null);
  const [sharedSelectionIndex, setSharedSelectionIndex] = useState(0);
  const [dice, setDice] = useState(null);
  const [phase, setPhase] = useState("donation");
  const [deck, setDeck] = useState(buildDeck());
  const [discardPile, setDiscardPile] = useState([]);
  const [sharedPool, setSharedPool] = useState([]);
  const [players, setPlayers] = useState([]);
  const [playersOnline, setPlayersOnline] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [lastDonatorIndex, setLastDonatorIndex] = useState(null);
  const [finalPhaseDone, setFinalPhaseDone] = useState(false);

  //For Auctions
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [currentBid, setCurrentBid] = useState(0);
  const [highestBidder, setHighestBidder] = useState(null);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [activeBidders, setActiveBidders] = useState([]);
  const [awaitingGoldPayment, setAwaitingGoldPayment] = useState(false);
  const [goldPaymentWinner, setGoldPaymentWinner] = useState(null);
  const [awaitingCardPayment, setAwaitingCardPayment] = useState(false);
  const [selectedPaymentCards, setSelectedPaymentCards] = useState([]);
  const [goldWinner, setGoldWinner] = useState(null);
  const [goldCard, setGoldCard] = useState(null);
  const [auctionTurnOffset, setAuctionTurnOffset] = useState(0);
  const [finalResults, setFinalResults] = useState([]);
  const { room } = useParams();

  //For special dice cards
  const [specialCardToPlay, setSpecialCardToPlay] = useState(null);

  //For cursor
  const [remoteCursor, setRemoteCursor] = useState(null);

  const navigate = useNavigate();

  //For UI
  
  const handleRestart = () => {
  localStorage.removeItem("last_game_state");
  localStorage.removeItem("start_game_payload");

  // Optional: reset any local state if needed
  setFinalResults([]);
  setFinalPhaseDone(false);
  setPlayers([]);
  setDeck([]);
  setDice(null);

  navigate("/lobby");
};



  //Building out what gameState is
  const buildGameState = () => ({
    phase,
    deck,
    discardPile,
    sharedPool,
    players,
    currentPlayerIndex,
    lastDonatorIndex,
    sharedSelectionIndex,
    dice,
    finalPhaseDone,

     // 🔽 Auction state
    currentCardIndex,
    currentBid,
    highestBidder,
    activePlayerIndex,
    activeBidders,
    awaitingGoldPayment,
    goldPaymentWinner,
    awaitingCardPayment,
    selectedPaymentCards,
    goldWinner,
    goldCard,
    auctionTurnOffset,

    specialCardToPlay,
  });

  const broadcastState = (newPartialState = null) => {
  const fullState = {
    ...buildGameState(),      // ⬅️ get the full current state
    ...newPartialState        // ⬅️ overwrite any fields provided
  };
  console.log("📤 Broadcasting FULL game state:", fullState, playerName);
  socket.emit("sync_game_state", { room: `${room}`, gameState: fullState });
  console.log("After broadcasting full gamestate")
};

//Next section is taking information from broadcasts

//For Auction
useEffect(() => {
  if (phase === "auction") {
    console.log("🧾 Entering Auction Phase — FULL game state:");
    console.log(buildGameState());
  }
}, [phase]);

//When someone discards
useEffect(() => {
  const handler = (gameState) => {
    if (gameState?.donationAction?.action === "discarded") {
      console.log(`ASDFDSF🗑️ ${gameState.donationAction.player} discarded a card`);
    }
  };
  socket.on("sync_game_state", handler);
  return () => socket.off("sync_game_state", handler);
}, []);

//When someone keeps their card
useEffect(() => {
  const handler = (gameState) => {
    if (gameState?.donationAction?.action === "kept") {
      console.log(`sfsfsfs ${gameState.donationAction.player} kept a card`);
    }
  };
  socket.on("sync_game_state", handler);
  return () => socket.off("sync_game_state", handler);
}, []);

//For when host resets

useEffect(() => {
  const handler = (gameState) => {
    if (gameState.action === "hostReset") {
      console.log("This is the new gamestate after host reset the game", gameState)
    }
  };
  socket.on("sync_game_state", handler);
  return () => socket.off("sync_game_state", handler);
}, []);


//When someone draws a special card
useEffect(() => {
  const handleSync = (gameState) => {
    console.log("📡 Full sync received:", gameState);

    if ("specialCardToPlay" in gameState) {
      console.log("🎴 Setting specialCardToPlay:", gameState.specialCardToPlay);
      setSpecialCardToPlay(gameState.specialCardToPlay); // Can be null or an object
    }
  };

  socket.on("sync_game_state", handleSync);
  return () => socket.off("sync_game_state", handleSync);
}, []);



//Cursor
useEffect(() => {
  const handleCursor = ({ playerName, x, y }) => {
    setRemoteCursor({ playerName, x, y });
  };

  socket.on("cursor_position", handleCursor);
  return () => socket.off("cursor_position", handleCursor);
}, []);



useEffect(() => {
  console.log("🎯 auctionTurnOffset updated to:", auctionTurnOffset);
}, [auctionTurnOffset]);

useEffect(() => {
  console.log("📡 GameManager useEffect ran");

  const handleGameState = (gameState) => {
   if (!hasSynced.current) {
  hasSynced.current = true;
  console.log("✅ First sync");
} else {
  console.log("🔁 Re-syncing from broadcast");
}

    localStorage.setItem("last_game_state", JSON.stringify(gameState)); 

    setPhase(gameState.phase);
    setDeck(gameState.deck);
    setDiscardPile(gameState.discardPile);
    setSharedPool([...gameState.sharedPool]);  
    setPlayers(gameState.players);
    setCurrentPlayerIndex(gameState.currentPlayerIndex);
    setLastDonatorIndex(gameState.lastDonatorIndex);
    setDice(gameState.dice);
    setSharedSelectionIndex(gameState.sharedSelectionIndex ?? 0);
    setFinalPhaseDone(gameState.finalPhaseDone);

    //Auctions
    setCurrentCardIndex(gameState.currentCardIndex ?? 0);
    setCurrentBid(gameState.currentBid ?? 0);
    setHighestBidder(gameState.highestBidder);
    setActivePlayerIndex(gameState.activePlayerIndex ?? 0);
    setActiveBidders(gameState.activeBidders ?? []);
    setAwaitingGoldPayment(gameState.awaitingGoldPayment ?? false);
    setGoldPaymentWinner(gameState.goldPaymentWinner ?? null);
    setAwaitingCardPayment(gameState.awaitingCardPayment ?? false);
    setSelectedPaymentCards(gameState.selectedPaymentCards ?? []);
    setGoldWinner(gameState.goldWinner ?? null);
    setGoldCard(gameState.goldCard ?? null);
    setAuctionTurnOffset(gameState.auctionTurnOffset ?? 0);

    if (gameState.donationAction) 
  {
    const { player, action, card } = gameState.donationAction;
    console.log(`🔊 ${player} just ${action} a card: ${card.type} ${card.value}`);
  }

  };

  // ✅ Use fallback *once* before listener
  if (!hasSynced.current) {
    const cached = localStorage.getItem("last_game_state");
  }


  socket.on("sync_game_state", handleGameState);

  
  if (playerName) {
    socket.emit("join_game", { room: `${room}`, playerName });
    
    const cachedStart = localStorage.getItem("start_game_payload");
    if (cachedStart) {
      console.log("📦 Using cached start_game payload");
      const { players: rawPlayers } = JSON.parse(cachedStart);

      const initializedPlayers = rawPlayers.map((p) => ({
        name: p.name,
        gold: 0,
        points: 0,
        hand: [],
      }));

      setPlayers(initializedPlayers);
      setCurrentPlayerIndex(0);

      setTimeout(() => {

        const newDeck = buildDeck();

        const rolledDice = rollDice();
        setDice(rolledDice); 
        const state = {
          phase: "donation",
          deck: newDeck,
          discardPile: [],
          sharedPool: Array.isArray(sharedPool) ? sharedPool : [],
          players: initializedPlayers,
          currentPlayerIndex: 0,
          lastDonatorIndex: null,
          dice: rolledDice,
          finalPhaseDone: false,
          auctionTurnOffset: 0,  
        };
        console.log("👑 Host broadcasting initial game state:", state);
        socket.emit("sync_game_state", { room: `${room}`, gameState: state });
      }, 0);

      localStorage.removeItem("start_game_payload");
      localStorage.removeItem("last_game_state");  // <-- ✅ add this
    }

    if (!hasSynced.current) {
      const cachedGameState = localStorage.getItem("last_game_state");
      if (cachedGameState) {
        console.log("📦 Using cached game state");
        handleGameState(JSON.parse(cachedGameState));
      }
    }

    socket.on("player_list", (list) => {
      setPlayersOnline(list);
    });
  }

  return () => {
    socket.off("player_list");
    socket.off("sync_game_state", handleGameState);
  };
}, [playerName]);




  if (!players.length || !players[currentPlayerIndex]) {
    console.log("⏳ Still waiting for game initialization...");
    return <div>Waiting for game state to initialize...</div>;
  }

  const currentPlayer = players[currentPlayerIndex];

  const advancePhase = () => {
    if (phase === "auction") {
      const newDice = rollDice();
      setDice(newDice);
      setPhase("scoring");
    } else if (phase === "scoring") {
      setPhase("results");
    } else if (phase === "results") {
      console.log("Game over.");
    }
  };

  return (
    <div>
      <h1 style={{ textAlign: "center", marginTop: "50px" }}>Biblios Game</h1>

      <div>
        <h3>Players Online:</h3>
        <ul style={{ display: "flex", gap: "1rem", listStyleType: "none", padding: 0 }}>
          {playersOnline.map((p, i) => (
            <li key={i}>{p.name}</li>
          ))}
        </ul>
      </div>

      <p style={{ textAlign: "center" }}>Current Phase: {phase}</p>
     {dice && (
  <div style={{ position: "relative", marginBottom: "20px" }}>
    <h3 style={{ textAlign: "center" }}>🎲 Dice Values</h3>

    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "20px" }}>
      <ul
        style={{
          display: "flex",
          listStyle: "none",
          padding: 0,
          gap: "12px",
          margin: 0,
        }}
      >
        {dice.map((die, idx) => (
          <li
            key={idx}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              backgroundColor: "#f9f9f9",
              minWidth: "80px",
              textAlign: "center",
            }}
          >
            <strong>{die.resource_type}</strong>: {die.value}
          </li>
        ))}
      </ul>

      {(phase === "donation" || phase === "shared_selection") &&(
  <div style={{ position: "relative", display: "inline-block", textAlign: "center" }} className="deck-container">
    <div style={{ fontSize: "14px", marginBottom: "4px", fontWeight: "bold" }}>
      Remaining Deck
    </div>
    <img
      src="/hearthstonecards.webp"
      alt="Deck"
      style={{
        width: "70px",
        height: "auto",
        borderRadius: "6px",
        boxShadow: "0 0 6px rgba(0,0,0,0.3)",
        cursor: "pointer",
      }}
    />
    <div
      style={{
        position: "absolute",
        top: "-30px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#333",
        color: "#fff",
        padding: "4px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        opacity: 0,
        transition: "opacity 0s",
      }}
      className="deck-tooltip"
    >
      Cards remaining: {deck.length}
    </div>
  </div>
)}

    </div>

    {/* ✅ Add inline CSS for hover effect */}
    <style>
      {`
        .deck-container:hover .deck-tooltip {
          opacity: 1 !important;
        }
      `}
    </style>

    <div style={{ position: "relative", display: "inline-block", marginLeft: "20px", textAlign: "center" }}>
      <div style={{ fontSize: "14px", marginBottom: "4px" }}>Discard</div>
      <img
        src="/hearthstonecards.webp"
        alt="Discard"
        style={{
          width: "70px",
          height: "auto",
          borderRadius: "6px",
          boxShadow: "0 0 6px rgba(0,0,0,0.3)",
          filter: "grayscale(100%) brightness(80%)", // visually distinguish it
          transform: "rotate(-10deg)",
          cursor: "default",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "-30px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#333",
          color: "#fff",
          padding: "4px 8px",
          borderRadius: "4px",
          fontSize: "12px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          opacity: 1,
        }}
      >
        {discardPile.length} cards
      </div>
    </div>
  </div> 
)}





    
        



      {phase === "donation" &&(
        // playerName === players[currentPlayerIndex]?.name &&
        <DonationPhase
          isCurrentPlayer={playerName === players[currentPlayerIndex]?.name}
          player={players.find(p => p.name === playerName)} // 👈 local player!
          players={players}
          deck={deck}
          setDeck={setDeck}
          setDiscardPile={setDiscardPile}
          discardPile={discardPile}
          sharedPool={sharedPool}
          phase={phase}
          setSharedPool={setSharedPool}
          setPlayers={setPlayers}
          broadcastState={broadcastState}
          currentPlayerIndex={currentPlayerIndex}
          
          specialCardToPlay={specialCardToPlay}
          setSpecialCardToPlay={setSpecialCardToPlay}
          totalPlayers={players.length}
          cursor={remoteCursor}
          onFinish={({ updatedDiscard, updatedShared, updatedPlayers }) => {
        
        }}


        />
      )}

      {phase === "shared_selection" && players[lastDonatorIndex] && (
  <SharedPoolSelection
    key={sharedSelectionIndex}
    players={players}
    broadcastState={broadcastState}
    activePlayer={players[sharedSelectionIndex]}
    sharedPool={sharedPool}
    setSharedPool={setSharedPool}
    discardPile={discardPile}
    phase = {phase}
    setPlayers={setPlayers}
    setPlayerGold={(updateFn) =>
      setPlayers((prev) =>
        prev.map((p, i) => {
          const updatedGold = updateFn(prev.map((p) => p.gold))[i];
          return { ...p, gold: updatedGold };
        })
      )
    }
    onFinish={() => {
  
      const nextPlayerIndex = (lastDonatorIndex + 1) % players.length;
      // console.log(`   - nextPlayerIndex: ${nextPlayerIndex}`);
      if (deck.length < players.length + 1) {
        // console.log("🎯 Switching to auction phase — NO broadcast here");
    setAuctionStarterIndex(nextPlayerIndex);
    setPhase("auction");

    setTimeout(() => {
      broadcastState({
        auctionStarterIndex: nextPlayerIndex,
        phase: "auction",
      });
    }, 50);
      } else {
        console.log(`🔄 [${playerName}] Continuing to next donation round — NO broadcast here`);
        setCurrentPlayerIndex(nextPlayerIndex);
        setSharedPool([]);
        setPhase("donation");

        setTimeout(() => {
      broadcastState({
        currentPlayerIndex: nextPlayerIndex,
        sharedPool: [],
        phase: "donation",
      });
    }, 50);
        
      }
    }}
    sharedSelectionIndex={sharedSelectionIndex}
    lastDonatorIndex={lastDonatorIndex}
    playerName={playerName}
  />
)}



      {phase === "auction" && (
        <AuctionPhase
          players={players}
          discardPile={discardPile}
          setDiscardPile={setDiscardPile}
          setPhase={setPhase}
          setPlayers={setPlayers}
          lastDonatorIndex={lastDonatorIndex}
          auctionStarterIndex={auctionStarterIndex}
          playerName={playerName}
          broadcastState={broadcastState}

          //AuctionState

          currentCardIndex={currentCardIndex}
          setCurrentCardIndex={setCurrentCardIndex}
          currentBid={currentBid}
          setCurrentBid={setCurrentBid}
          highestBidder={highestBidder}
          setHighestBidder={setHighestBidder}
          activePlayerIndex={activePlayerIndex}
          setActivePlayerIndex={setActivePlayerIndex}
          activeBidders={activeBidders}
          setActiveBidders={setActiveBidders}
          awaitingGoldPayment={awaitingGoldPayment}
          setAwaitingGoldPayment={setAwaitingGoldPayment}
          goldPaymentWinner={goldPaymentWinner}
          setGoldPaymentWinner={setGoldPaymentWinner}
          awaitingCardPayment={awaitingCardPayment}
          setAwaitingCardPayment={setAwaitingCardPayment}
          selectedPaymentCards={selectedPaymentCards}
          setSelectedPaymentCards={setSelectedPaymentCards}
          goldWinner={goldWinner}
          setGoldWinner={setGoldWinner}
          goldCard={goldCard}
          setGoldCard={setGoldCard}
          auctionTurnOffset={auctionTurnOffset}
          setAuctionTurnOffset={setAuctionTurnOffset}
        />
      )}

      

      {phase === "scoring" && dice && (
        <ScoringPhase
          players={players}
          dice={dice}
          isHost={players[0]?.name === playerName}
          setFinalResults={(scoredPlayers) => {
            setPlayers(scoredPlayers);
            setFinalResults(scoredPlayers);
            setFinalPhaseDone(true);
    
    // ✅ broadcast to all players
    broadcastState({
      players: scoredPlayers,
      finalResults: scoredPlayers,
      finalPhaseDone: true,
    });
  }}
  goToResults={() => {
    setPhase("results");
    broadcastState({ phase: "results" });
  }}
/>
      )}

      {phase === "results" && (
        <ResultsScreen
           players={finalResults}
            onRestart={handleRestart}
        />
      )}

      {/* {phase !== "donation" && phase !== "shared" && (
        <button onClick={advancePhase}>Next Phase</button>
      )} */}

      {phase !== "results" && (
        <>
        </>


      )}



        {phase !== "results" && phase !== "scoring" && (
        <div>
          <p>
            {playerName}: {players.find(p => p.name === playerName)?.gold ?? 0} gold
          </p>
        </div>
      )}

      <div style={{ marginTop: "30px" }}>
        <h3>Game State</h3>

        {/* ✅ KEEP: Player sees only their own hand */}
        <h4>{playerName}'s Hand</h4>
        <ul>
          <PlayerHand
    hand={players.find(p => p.name === playerName)?.hand || []}
    isCurrentPlayer={true}
  />
          {players.find(p => p.name === playerName)?.hand.map((card, index) => (
            <li key={index}>
              {card.type} {card.value}
            </li>
          )) ?? <li>(No cards)</li>}
        </ul>

        

        {/* 🔻 CHANGED: Hide discard pile unless debugging */}
        {false && (
          <>
            <h4>Discard Pile</h4>
            <ul>
              {discardPile.map((card, index) => (
                <li key={index}>
                  {card.type} {card.value}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ✅ KEEP: Everyone sees the shared pool */}
        <h4>Shared Pool</h4>
        <ul>
          {sharedPool.map((card, index) => (
            <li key={index}>
              {card.type} {card.value}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default GameRunner;