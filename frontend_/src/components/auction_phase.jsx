import Card from "./card";
import React, { useState, useMemo, useRef, useEffect } from "react";
import Timer from "../timer.jsx";

const AuctionPhase = ({
  players,
  discardPile,
  setDiscardPile,
  setPhase,
  setPlayers,
  lastDonatorIndex,
  auctionStarterIndex,
  playerName,
  broadcastState,

  currentCardIndex,
  setCurrentCardIndex,
  currentBid,
  setCurrentBid,
  highestBidder,
  setHighestBidder,
  activePlayerIndex,
  setActivePlayerIndex,
  activeBidders,
  setActiveBidders,
  awaitingGoldPayment,
  setAwaitingGoldPayment,
  goldPaymentWinner,
  setGoldPaymentWinner,
  awaitingCardPayment,
  setAwaitingCardPayment,
  selectedPaymentCards,
  setSelectedPaymentCards,
  goldWinner,
  setGoldWinner,
  goldCard,
  setGoldCard,
  auctionTurnOffset,
  setAuctionTurnOffset,
}) => {
  


  useEffect(() => 
  {
    if (activeBidders.length === 0) {
      const allIn = players.map(() => true);
      setActiveBidders(allIn);
  
    }
  }, [players, activeBidders, setActiveBidders]);

  useEffect(() => 
  {
     if (discardPile.length > 0 && currentCardIndex < discardPile.length) {


    
        const isLastCard = discardPile.length === 1;

         if (isLastCard) {
 
  
      return;
    }
        const allTrue = players.map(() => true);
        setActiveBidders(allTrue);
        setActivePlayerIndex(0); 
        setCurrentBid(0);
        setHighestBidder(null);

      

        broadcastState({
          activeBidders: allTrue,
          activePlayerIndex: 0,
          currentBid: 0,
          highestBidder: null,
        });
      }
  }, [currentCardIndex]);

 
  
  const biddingOrder = useMemo(() => {
    const order = players.map((_, i) => players[(auctionTurnOffset + i) % players.length]);
   
    return order;
  }, [players, auctionTurnOffset]);



  const currentCard = discardPile[currentCardIndex];
  const isGold = currentCard?.type === "Gold";
  const player = biddingOrder[activePlayerIndex];
  const isDiscardingPlayer =
  awaitingCardPayment && goldWinner?.player?.name === playerName;

  const [bidInput, setBidInput] = useState("");
  const isCurrentPlayer = player.name === playerName;



  const hostResetAuction = () => 
  {
    if (playerName !== players[0]?.name) {
      alert("Only the host can reset the auction round.");
      return;
    }

    if (discardPile.length === 0) {
      alert("No cards left in the discard pile to auction.");
      return;
    }

    const startingIndex = (lastDonatorIndex + 1) % players.length;

    const newState = {
      // Core auction values
      currentCardIndex: 0,
      currentBid: 0,
      highestBidder: null,

      // Auction player tracking
      activePlayerIndex: 0,
      auctionTurnOffset: 0,
      activeBidders: players.map(() => true),

      // Gold/card payment resets
      awaitingGoldPayment: false,
      awaitingCardPayment: false,
      goldWinner: null,
      goldCard: null,
      goldPaymentWinner: null,
      selectedPaymentCards: [],

      // Retain discard pile and phase
      discardPile,
      phase: "auction",
      action: "hostReset"
    };

    console.warn("🛠️ Host manually reset auction round this is newState", newState);
    broadcastState(newState);
  };


  const getNextActivePlayerIndex = () => 
  {
    let next = (activePlayerIndex + 1) % players.length;
    while (!activeBidders[next]) 
      {
        next = (next + 1) % players.length;
      }
    return next;
  };

  const handleBid = (amount) =>
  {
    if (isGold && amount > player.hand.length) return;
    if (!isGold && amount > player.gold) 
    {
      return alert("You don't have enough gold");
    }

    const isFirstBid = highestBidder === null;
    if (!isFirstBid && amount <= currentBid) 
    {
      return alert("Bid too low!");
    }

    const updated = [...activeBidders];
    updated[activePlayerIndex] = true;

    setCurrentBid(amount);
    setHighestBidder(activePlayerIndex);
    setActiveBidders(updated);
    const next = getNextActivePlayerIndex();
    setActivePlayerIndex(next);

    broadcastState({
      currentBid: amount,
      highestBidder: activePlayerIndex,
      activeBidders: updated,
      activePlayerIndex: next,
    });


    const stillIn = updated.filter(Boolean).length;

    if (stillIn === 1) {
  
      finishAuction(updated, activePlayerIndex, amount);
    } else {
      // nextPlayer();
    }
  };

  const handleResetAuction = () => {
  console.warn("🧨 Resetting auction phase by host");

  const hostIndex = 0;
  setAuctionTurnOffset(hostIndex);
  setActivePlayerIndex(0);
  setCurrentBid(0);
  setHighestBidder(null);
  const allTrue = players.map(() => true);
  setActiveBidders(allTrue);

  broadcastState({
    auctionTurnOffset: hostIndex,
    activePlayerIndex: 0,
    currentBid: 0,
    highestBidder: null,
    activeBidders: allTrue,
  });
};


  const handlePass = () => {
   
    const updated = [...activeBidders];
    updated[activePlayerIndex] = false;
    setActiveBidders(updated);
   


    const next = getNextActivePlayerIndex();
  
    setActivePlayerIndex(next);

    broadcastState({
      activeBidders: updated,
      activePlayerIndex: next,
    });

    const stillIn = updated.filter(Boolean).length;
    const hasBid = highestBidder !== null;
   

    if (stillIn === 0) {
      
      finishAuction(updated, hasBid ? highestBidder : null);
    } else if (stillIn === 1 && hasBid) {
    
     
      finishAuction(updated, highestBidder);
    } else {
     
    }
  };

  
  const finishAuction = (finalBidders, winnerIndex, winningBid = currentBid) => 
  {

   

  
    //If No one wins the card
    if (winnerIndex == null) 
    {

      const updatedDiscardPile = [...discardPile];
      updatedDiscardPile.splice(currentCardIndex, 1); 
      setDiscardPile(updatedDiscardPile);
      setCurrentCardIndex(0);

       if (updatedDiscardPile.length === 0) {

          setPhase("scoring");
          broadcastState({
            discardPile: [],
            phase: "scoring",
          });
          return; 
        }

      if (updatedDiscardPile.length > 0) {
        const newOffset = (auctionTurnOffset + 1) % players.length;
        const newAuctionStarter = players[newOffset]?.name;
    

        setCurrentCardIndex(0);
        setHighestBidder(null);
        setActiveBidders(players.map(() => true));
        setAuctionTurnOffset(newOffset);
        setActivePlayerIndex(0);
        setCurrentBid(0);

        broadcastState({
          discardPile: updatedDiscardPile,
          currentCardIndex: 0,
          highestBidder: null,
          activeBidders: players.map(() => true),
          activePlayerIndex: 0,
          currentBid: 0,
          auctionTurnOffset: newOffset,
          }, "No one bid -- card discarded");
        }
        
    } 

    else //A player won the card
    {
     
        const updatedPlayers = [...players];
        const winnerName = biddingOrder[winnerIndex].name;
        const winnerIdx = players.findIndex((p) => p.name === winnerName);
        const winner = updatedPlayers[winnerIdx];
     


        if (isGold) //Settig up Gold Card Payment
          {
          
            winner.gold += currentCard.value;

       
            winner.hand.push(currentCard);
            
            setAwaitingCardPayment(true);
            setGoldWinner({ player: winner, index: winnerIdx, bid: winningBid });
            setGoldCard(currentCard);
            setPlayers(updatedPlayers);

         

            broadcastState({
              players: updatedPlayers,
              awaitingCardPayment: true,
              goldWinner: { player: winner, index: winnerIdx, bid: winningBid },
              goldCard: currentCard,
            });

            return;
          } 
        else 
          {
            setAwaitingGoldPayment(true);
            setGoldPaymentWinner({ player: winner, index: winnerIdx, card: currentCard, bid: winningBid });
            setPlayers(updatedPlayers);

          

            broadcastState({
              players: updatedPlayers,
              awaitingGoldPayment: true,
              goldPaymentWinner: {
                player: winner,
                index: winnerIdx,
                card: currentCard,
                bid: winningBid
            },
          });

          return;
        }
    }



  };


  if (!currentCard) {

    setPhase("scoring");
    broadcastState({
      discardPile: [],
      phase: "scoring",
    });
    return <p>No cards to auction.</p>;
  }

  // 🔶 Non-gold card won → pay with gold cards
  if (awaitingGoldPayment && goldPaymentWinner) {
    const isLocalPlayerWinner = playerName === goldPaymentWinner.player.name;

   
    const toggleGoldCardSelection = (card, idx) => {
    if (!isLocalPlayerWinner || card.type !== "Gold") return;
    setSelectedPaymentCards((prev) => {
      const alreadySelected = prev.find((c) => c.idx === idx);
      return alreadySelected
        ? prev.filter((c) => c.idx !== idx)
        : [...prev, { ...card, idx }];
    });
  };

    const totalSelected = selectedPaymentCards.reduce((sum, c) => sum + c.value, 0);

    const confirmGoldPayment = () => {
      

      if (!isLocalPlayerWinner) {
       
        return;
      }
      if (totalSelected < goldPaymentWinner.bid) {
        alert(`Selected cards only add up to ${totalSelected}. Must be at least ${goldPaymentWinner.bid}.`);
        return;
      }

      const updatedPlayers = [...players];
      const hand = [...updatedPlayers[goldPaymentWinner.index].hand];
  
      // Remove selected gold cards from hand
      const filtered = hand.filter((_, i) =>
        !selectedPaymentCards.some((c) => c.idx === i)
        );
      updatedPlayers[goldPaymentWinner.index].hand = filtered;

      // Decrease player's gold count
      updatedPlayers[goldPaymentWinner.index].gold -= totalSelected;

      // Add the won card to hand
     
      updatedPlayers[goldPaymentWinner.index].hand.push(goldPaymentWinner.card);
      const updatedDiscardPile = [...discardPile];
      updatedDiscardPile.splice(currentCardIndex, 1); // or use .shift() if always index 0
      setDiscardPile(updatedDiscardPile);
     

      setPlayers(updatedPlayers);
      setAwaitingGoldPayment(false);
      setSelectedPaymentCards([]);
      setCurrentBid(0);
      // setCurrentCardIndex((prev) => prev + 1);
      setHighestBidder(null);
      setActiveBidders(players.map(() => true));
      setAuctionTurnOffset((prev) => (prev + 1) % players.length);
      const newAuctionStarterIndex = (auctionTurnOffset + 1) % players.length;
      const newAuctionStarter = players[newAuctionStarterIndex]?.name;
      setActivePlayerIndex(0);

    
      broadcastState({
        players: updatedPlayers,
        awaitingGoldPayment: false,
        selectedPaymentCards: [],
        currentBid: 0,
        currentCardIndex: 0,
        highestBidder: null,
        activeBidders: players.map(() => true),
        activePlayerIndex: 0,
        discardPile: updatedDiscardPile,
        auctionTurnOffset: (auctionTurnOffset + 1) % players.length,
      }, `${playerName} has paid ${totalSelected} gold for card: (${goldPaymentWinner.card.type} ${goldPaymentWinner.card.value})`);



      

      if (updatedDiscardPile.length === 0) {
       
        setPhase("scoring");
        broadcastState({
          discardPile: [],
          phase: "scoring",
        });
      }
    };


    return (
      <div>

        {goldPaymentWinner?.player?.name === playerName ?(
          <>
          <h3>{goldPaymentWinner.player.name}, pay {goldPaymentWinner.bid} gold with your gold cards:</h3>
        <p>Total selected: {totalSelected}</p>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {players[goldPaymentWinner.index].hand.map((card, idx) => (
            <div
              key={idx}
              onClick={() => toggleGoldCardSelection(card, idx)}
              style={{
                border: selectedPaymentCards.some((c) => c.idx === idx)
                  ? "2px solid red"
                  : "1px solid gray",
                margin: "5px",
                cursor: card.type === "Gold" ? "pointer" : "not-allowed",
                opacity: card.type === "Gold" ? 1 : 0.4,
                
              }}
            >
             <Card
  card={card}
  force_back={!isDiscardingPlayer}
  locked_back_flip={true}
/>


            </div>
          ))}
        </div>
        <button
  onClick={() => {
 
    confirmGoldPayment();
  }}
>
  Confirm Payment
</button></>

        ) : (
          <p>
            Please wait 
          </p>
        )}
        
      </div>
    );
  }

  // 🔶 Gold card won → discard equal number of cards
  if (awaitingCardPayment && goldWinner) {
   
    const toggleCardSelection = (card, idx) => {
      if (!isDiscardingPlayer) return;
      setSelectedPaymentCards((prev) => {
        const alreadySelected = prev.find((c) => c.idx === idx);
        return alreadySelected
          ? prev.filter((c) => c.idx !== idx)
          : [...prev, { ...card, idx }];
      });
    };

    const confirmCardPayment = () => 
    {
      if (selectedPaymentCards.length !== goldWinner.bid) 
      {
        alert(`You must select exactly ${goldWinner.bid} cards.`);
        return;
      }


      const updatedPlayers = [...players];
      const hand = [...updatedPlayers[goldWinner.index].hand];

      //Removing selected cards
      const filtered = hand.filter((_, i) =>
        !selectedPaymentCards.some((c) => c.idx === i)
      );
      updatedPlayers[goldWinner.index].hand = filtered;

      //Removing gold if they got rid of gold. 
      const discardedGold = selectedPaymentCards
      .filter((c) => c.type === "Gold")
      .reduce((sum, c) => sum + c.value, 0);

     

      updatedPlayers[goldWinner.index].gold -= discardedGold;

    


     
      const updatedDiscardPile = [...discardPile];
      updatedDiscardPile.splice(currentCardIndex, 1); 
      setDiscardPile(updatedDiscardPile);
     

      const newAuctionStarterIndex = (auctionTurnOffset + 1) % players.length;
      const newAuctionStarter = players[newAuctionStarterIndex]?.name;
    

      setAuctionTurnOffset(newAuctionStarterIndex);
      setActivePlayerIndex(0); 
      setHighestBidder(null);
      setActiveBidders(players.map(() => true));
      setCurrentCardIndex(0);
      
      setPlayers(updatedPlayers);
      setAwaitingCardPayment(false);
      setSelectedPaymentCards([]);
      setCurrentBid(0);

      const formattedDiscarded = selectedPaymentCards
      .map((card) => `${card.type} ${card.value}`)
      .join(", ");
      

      broadcastState
      ({
        players: updatedPlayers,
        awaitingCardPayment: false,
        selectedPaymentCards: [],
        currentBid: 0,
        discardPile: updatedDiscardPile,
        auctionTurnOffset: newAuctionStarterIndex,
        activePlayerIndex: 0,
        activeBidders: players.map(() => true),
        highestBidder: null,
        currentCardIndex: 0,
      }, `${playerName} has paid ${selectedPaymentCards.length} card(s) for the gold card (${goldCard.type} ${goldCard.value}). Discarded: [${formattedDiscarded}]`);
     

      if (updatedDiscardPile.length === 0) 
      {
     
        setPhase("scoring");
        broadcastState({
          discardPile: [],
          phase: "scoring",
        });
      }
    };

    return (
      <div>

        {isDiscardingPlayer ? (
          <>
          <h3>{goldWinner.player.name}, select {goldWinner.bid} cards to discard:</h3>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {goldWinner.player.hand.map((card, idx) => (
            <div
              key={idx}
              onClick={() => 
                {
                  if (idx !== goldWinner.player.hand.length - 1)
                   {
                      toggleCardSelection(card, idx);
                   }
              }}
              style=
              {{
                border: selectedPaymentCards.some((c) => c.idx === idx)
                  ? "2px solid red"
                  : "1px solid gray",
                margin: "5px",
                cursor: isDiscardingPlayer ? "pointer" : "not-allowed",
                opacity: idx === goldWinner.player.hand.length - 1 ? 0.5 : 1, // dim the new card
                pointerEvents: isDiscardingPlayer ? "auto" : "none",
              }}
            >
              
              <Card card={card} force_back={!isDiscardingPlayer} locked_back_flip={true}/>

            </div>
          ))}
        </div>

        <button
            onClick={confirmCardPayment}
            disabled={!isDiscardingPlayer}
            style={{
              marginTop: "15px",
              opacity: isDiscardingPlayer ? 1 : 0.5,
              pointerEvents: isDiscardingPlayer ? "auto" : "none",
            }}
          >
            Confirm Discard
          </button>

          </>
        ) : (
          <p>Waiting for someone to discard</p>
        )}
        
      </div>
    );
  }

  // 🔶 Main auction UI
  return (
    <div>

      {playerName === players[0]?.name && (
        <button onClick={hostResetAuction}>🔁 Reset Auction Round</button>
      )}
      <h3>Auction Phase</h3>
      <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>

    <div>
      <p style={{ fontWeight: "bold", fontSize: "1.2rem", margin: 0 }}>
        👉 {player.name}'s turn to bid
      </p>
      <p style={{ marginTop: "0.25rem" }}>
        {player.name === playerName
          ? `Gold: ${player.gold}, Cards: ${player.hand.length}`
          : `Cards: ${player.hand.length}`}
      </p>
    </div>

    <div style={{ display: "flex", justifyContent: "center", marginLeft:"455px" }}>
  <Card {...currentCard} locked_back_flip={!isCurrentPlayer} />
</div>
    
</div>
      <p style={{textAlign: "center"}}>
        Current Bid: {currentBid} by{" "}
        {highestBidder != null ? biddingOrder[highestBidder].name : "None"}
      </p>
     
   

    {player.name === playerName && (
      <div style={{textAlign: "center"}}>
        <>
          <input
            type="number"
            min={1}
            placeholder="Enter bid"
            value={bidInput}
            onChange={(e) => setBidInput(e.target.value)}
          />
          <button
            onClick={() => {
            const parsed = Number(bidInput);
            const isInvalid =
            bidInput === "" ||
            isNaN(parsed) ||
            !Number.isInteger(parsed) ||
            parsed < 1;

            if (isInvalid) {
            alert("Please enter a valid whole number (minimum 1).");
            return;
            }


            handleBid(parsed);
            setBidInput("");
            }}
            style={{
            opacity: bidInput === "" || isNaN(Number(bidInput)) ? 0.5 : 1,
            pointerEvents:
            bidInput === "" || isNaN(Number(bidInput)) ? "none" : "auto",
            }}
          >
          Bid
          </button>

        </>

        <button onClick={handlePass}>Pass</button>

          <Timer
          duration={10000}
          onTimeout={() => 
            {
            console.log("poop")
          }}
          small_duration={true}
          
          />
      </div>
    )}

    </div>
  );
};

export default AuctionPhase;