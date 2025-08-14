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
import ChatBox from "./chatbox.jsx";
import "./game_layout.css";
import "./lobby.css";
import RulesPage from "./rulespage"; 
import Timer from "../timer.jsx";
import CardFlip from "../sound/flipcard-91468.mp3";
import {updatedSettings} from "./settings.jsx";



const GameRunner = ({ playerName }) => {

  console.log(updatedSettings)

  const hasSynced = useRef(false);
  const [auctionStarterIndex, setAuctionStarterIndex] = useState(null);
  const [sharedSelectionIndex, setSharedSelectionIndex] = useState(0);
  const [dice, setDice] = useState(null);
  const [phase, setPhase] = useState("donation");

  //Test
  const [deck, setDeck] = useState([]); // Start empty; build later with receivedSettings


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
   const [rulesPage, setRulesPage] = useState(false);

  const toggleRulesPage = () => {
    setRulesPage((prev) => {
  
    return !prev;
  });
  }

  //Deck
  const [deckSettings, setDeckSettings] = useState(null);


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

  const broadcastState = (newPartialState = null, message = null) => {
  const fullState = {
    ...buildGameState(),      // ⬅️ get the full current state
    ...newPartialState        // ⬅️ overwrite any fields provided
  };
 
  socket.emit("sync_game_state", { room: `${room}`, gameState: fullState });

  if (message) {
    socket.emit("chat_message", {room, playerName: "Game Announcement", message});
  }


};

//Next section is taking information from broadcasts
socket.on("add_playerlist", ({ playerName }) => {
  setPlayersOnline(prev => {
    const next = prev.includes(playerName) ? prev : [...prev, playerName];
    console.log("playersOnline ->", next);
    return next;
  });
});
//For Auction
useEffect(() => {
  if (phase === "auction") {
    // console.log("🧾 Entering Auction Phase — FULL game state:");
    // console.log(buildGameState());
  }
}, [phase]);

//When someone discards
useEffect(() => {
  const handler = (gameState) => {
    if (gameState?.donationAction?.action === "discarded") {
    
    }
  };
  socket.on("sync_game_state", handler);
  return () => socket.off("sync_game_state", handler);
}, []);

//When someone keeps their card
useEffect(() => {
  const handler = (gameState) => {
    if (gameState?.donationAction?.action === "kept") {
     
    }
  };
  socket.on("sync_game_state", handler);
  return () => socket.off("sync_game_state", handler);
}, []);

//For when someone pools
useEffect(() => {
  const handler = (gameState) => {
    if (gameState?.donationAction?.action === "pooled") {
     console.log("I have been received by everyone")
     const cardFlipAudio = new Audio(CardFlip)
     cardFlipAudio.volume = 1
     cardFlipAudio.play()
     console.log("end")
    }
  };
  socket.on("sync_game_state", handler);
  return () => socket.off("sync_game_state", handler);
}, []);

//For when host resets

useEffect(() => {
  const handler = (gameState) => {
    if (gameState.action === "hostReset") {
  
    }
  };
  socket.on("sync_game_state", handler);
  return () => socket.off("sync_game_state", handler);
}, []);


//When someone draws a special card
useEffect(() => {
  const handleSync = (gameState) => {
   

    if ("specialCardToPlay" in gameState) {
    
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
  // console.log("🎯 auctionTurnOffset updated to:", auctionTurnOffset);
}, [auctionTurnOffset]);

useEffect(() => {


  const handleGameState = (gameState) => {
   if (!hasSynced.current) {
  hasSynced.current = true;

} else {

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
     
      const { players: rawPlayers, deckSettings: receivedSettings } = JSON.parse(cachedStart);
      setDeckSettings(receivedSettings);  // 👈 Save for deck building


      const initializedPlayers = rawPlayers.map((p) => ({
        name: p.name,
        gold: 0,
        points: 0,
        hand: [],
      }));

      setPlayers(initializedPlayers);
      setCurrentPlayerIndex(0);

      setTimeout(() => {

        const newDeck = buildDeck(receivedSettings);
        setDeck(newDeck);

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
      
        socket.emit("sync_game_state", { room: `${room}`, gameState: state });
      }, 0);

      localStorage.removeItem("start_game_payload");
      localStorage.removeItem("last_game_state");  // <-- ✅ add this
    }

    if (!hasSynced.current) {
      const cachedGameState = localStorage.getItem("last_game_state");
      if (cachedGameState) {
       
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
  const activeIndex =
  phase === "auction" ? activePlayerIndex : currentPlayerIndex;

  return (

    <div>
      
      <h1 className="game-title">Biblios Game</h1> 

       <button style={{marginLeft: "200px", marginTop: "10px"}} className={'menu-button'} onClick={toggleRulesPage}>
        Rules
      </button>
        <div className="players-online">
        <h4>Players Online:</h4>
        
         <p style={{ margin: 0, fontWeight: "bold" }}>
  {playersOnline.slice(0, -1).map((p, i) => {
    const isActive = players[activeIndex]?.name === p.name;
    return (
      <span key={i} style={{ color: isActive ? "red" : "black" }}>
        {p.name}
        {i < playersOnline.length - 1 ? "  " : ""}
      </span>
    );
  })}
</p>


       

      {rulesPage && <RulesPage onClose={() => setRulesPage(false)} />}
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
        {dice.map((die, idx) => 
        (
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

      {(phase === "donation" || phase === "shared_selection" || phase === "auction") && (
  <div className="top-right-card-container">
    
    {/* Discard Pile on the Left */}
    <div className="discard-container">
      <div style={{ fontSize: "14px", marginBottom: "4px" }}>Discard</div>
      <img
        src="/hearthstonecards.webp"
        alt="Discard"
        style={{
          width: "70px",
          height: "auto",
          borderRadius: "6px",
          boxShadow: "0 0 6px rgba(0,0,0,0.3)",
          filter: "grayscale(100%) brightness(80%)",
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

    {/* Remaining Deck on the Right */}
    <div className="deck-container">
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
    
      if (deck.length < players.length + 1) {

    setAuctionStarterIndex(nextPlayerIndex);
    setPhase("auction");

    setTimeout(() => {
      broadcastState({
        auctionStarterIndex: nextPlayerIndex,
        phase: "auction",
      });
    }, 50);
      } else {
  
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


      {phase !== "results" && (
        <>
        </>


      )}



        {phase !== "results" && phase !== "scoring" && (
        <div>
          <p>
            {/* {playerName}: {players.find(p => p.name === playerName)?.gold ?? 0} gold */}
          </p>
        </div>
      )}

      <div style={{ marginTop: "30px", textAlign: "center" }}>
  <h4>Your Hand ↓</h4>

  <ul style={{
    display: "flex",
    justifyContent: "center",
    listStyle: "none",
    padding: 0,
    gap: "10px"
  }}>
    <PlayerHand
      hand={players.find(p => p.name === playerName)?.hand || []}
      isCurrentPlayer={true}
    />
  </ul>
</div>

    </div>
  );
};

export default GameRunner;