import Card from "./card";
import React, { useState, useMemo, useRef, useEffect } from "react";

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
      console.log("✅ Set activeBidders to all true:", allIn);
    }
  }, [players, activeBidders, setActiveBidders]);

  useEffect(() => 
  {
    if (discardPile[currentCardIndex]) 
      {
        const allTrue = players.map(() => true);
        setActiveBidders(allTrue);
        setActivePlayerIndex(0); 
        setCurrentBid(0);
        setHighestBidder(null);

        console.log("🔁 New auction round started — resetting activeBidders:", allTrue);
        console.log("Active bidders:", activeBidders)
        console.log("📥 auctionTurnOffset received:", auctionTurnOffset);

        broadcastState({
          activeBidders: allTrue,
          activePlayerIndex: 0,
          currentBid: 0,
          highestBidder: null,
        });
      }
  }, [currentCardIndex]);

  console.log("New activeBidders", activeBidders)
  
  const biddingOrder = useMemo(() => {
    const order = players.map((_, i) => players[(auctionTurnOffset + i) % players.length]);
    console.log("🧭 Bidding order now:", order.map(p => p.name));
    return order;
  }, [players, auctionTurnOffset]);

  console.log("🎯 Current bidder should be:", biddingOrder[activePlayerIndex]?.name);

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
      auctionTurnOffset: startingIndex,
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
    console.log("I am in auction_phase handle next and this is stillIn", stillIn)
    if (stillIn === 1) {
      console.log("StillIn === 1 within HandleBid")
      console.log("Printing amount, currentBid", amount, currentBid)
      console.log("Passing amount into finishAuction")
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
    console.log("🚫 Player passed:", players[activePlayerIndex]?.name);
    const updated = [...activeBidders];
    updated[activePlayerIndex] = false;
    setActiveBidders(updated);
    console.log("🔄 Updated activeBidders after pass:", updated);


    const next = getNextActivePlayerIndex();
    console.log("➡️ Next active player index:", next, players[next]?.name);
    setActivePlayerIndex(next);

    broadcastState({
      activeBidders: updated,
      activePlayerIndex: next,
    });

    const stillIn = updated.filter(Boolean).length;
    const hasBid = highestBidder !== null;
    console.log("🧮 Players still in:", stillIn, "| Has anyone bid?", hasBid);

    if (stillIn === 0) {
      console.log("🟠 All players passed");
      finishAuction(updated, hasBid ? highestBidder : null);
    } else if (stillIn === 1 && hasBid) {
      // console.log("Debug Phase 1, stillIn === 1")
      console.log("🟢 One player left — winner:", players[highestBidder]?.name);
      finishAuction(updated, highestBidder);
    } else {
      console.log("🕓 Moving to next bidder...");
    }
  };

  
  const finishAuction = (finalBidders, winnerIndex, winningBid = currentBid) => 
  {

    console.log("FinishAuction called with winningBid of", winningBid)

  
    //If No one wins the card
    if (winnerIndex == null) 
    {
      alert("No one bid — card discarded.");
      console.log("⚠️ Everyone passed — no winner.");

      const updatedDiscardPile = [...discardPile];
      updatedDiscardPile.splice(currentCardIndex, 1); 
      setDiscardPile(updatedDiscardPile);

      if (updatedDiscardPile.length > 0) {
        const newOffset = (auctionTurnOffset + 1) % players.length;
        const newAuctionStarter = players[newOffset]?.name;
        console.log("🎯 Next auction round will start with:", newAuctionStarter, playerName);

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
          });
        }
        
    } 

    else //A player won the card
    {
        console.log("Debug step 2, in the else statement ")
        const updatedPlayers = [...players];
        const winnerName = biddingOrder[winnerIndex].name;
        const winnerIdx = players.findIndex((p) => p.name === winnerName);
        const winner = updatedPlayers[winnerIdx];
        console.log("🏆 Winner found:", winner.name);


        if (isGold) //Settig up Gold Card Payment
          {
            console.log("if (isGold) Debug step 3, printing currentBid", currentBid)
            winner.gold += currentCard.value;

            console.log("NOT PUSHING IN isGold")
            winner.hand.push(currentCard);
            
            setAwaitingCardPayment(true);
            setGoldWinner({ player: winner, index: winnerIdx, bid: winningBid });
            setGoldCard(currentCard);
            setPlayers(updatedPlayers);

            console.log("💰 Gold card won by:", winner.name);

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

            console.log("📦 Non-gold card won — awaiting gold payment from:", winner.name);

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

  console.log("📦 Checking discard pile length:", updatedDiscardPile.length);

  };


  if (!currentCard) {
    console.log("🎯 No more cards — transitioning to scoring phase.");
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

    console.log("✅ Awaiting gold payment. Local player is winner?", isLocalPlayerWinner);
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
      console.log("I have been received and I am in confirmGoldPayment and this is goldPaymentWinner.bid", goldPaymentWinner.bid)

      if (!isLocalPlayerWinner) {
        console.log("some piss")
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
      console.log("Pushing the card in confirmGoldPayment")
      updatedPlayers[goldPaymentWinner.index].hand.push(goldPaymentWinner.card);
      const updatedDiscardPile = [...discardPile];
      updatedDiscardPile.splice(currentCardIndex, 1); // or use .shift() if always index 0
      setDiscardPile(updatedDiscardPile);
      console.log("🧾 Updated discard pile after gold payment:", updatedDiscardPile);

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
      console.log("🎯 Next auction round will start with I am in gold payment:", newAuctionStarter);
      setActivePlayerIndex(0);

      console.log("🔄 I am right before broadcaststate in confirmGoldPayment, Incremented auctionTurnOffset to:", (auctionTurnOffset + 1) % players.length);

      console.log("📤 About to broadcast auctionTurnOffset =", (auctionTurnOffset + 1) % players.length);
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
      });
      console.log("📤 Broadcasting updated discard pile after the broadcaststate in the confirmgoldpayment:", updatedDiscardPile);

      if (updatedDiscardPile.length === 0) {
        console.log("🎯 No more cards — transitioning to scoring phase.");
        setPhase("scoring");
        broadcastState({
          discardPile: [],
          phase: "scoring",
        });
      }
    };


    return (
      <div>
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
    console.log("🖱️ Button clicked");
    confirmGoldPayment();
  }}
>
  Confirm Payment
</button>
      </div>
    );
  }

  // 🔶 Gold card won → discard equal number of cards
  if (awaitingCardPayment && goldWinner) {
    console.log("I am in awaitingCardPayment")
    console.log("This is current bid", currentBid)
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
      console.log("I AM IN CONFIRMCADPAYMENT and this is the new goldWinner.bid", goldWinner.bid)
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

      console.log("🟡 Discarded gold total:", discardedGold);
      console.log("💰 Gold before:", updatedPlayers[goldWinner.index].gold);

      updatedPlayers[goldWinner.index].gold -= discardedGold;

      console.log("💰 Gold after:", updatedPlayers[goldWinner.index].gold);


     
      const updatedDiscardPile = [...discardPile];
      updatedDiscardPile.splice(currentCardIndex, 1); 
      setDiscardPile(updatedDiscardPile);
      console.log("ConfirmCardPayment updating the discard pile", updatedDiscardPile)

      const newAuctionStarterIndex = (auctionTurnOffset + 1) % players.length;
      const newAuctionStarter = players[newAuctionStarterIndex]?.name;
      console.log("🎯 Next auction round will start with:", newAuctionStarter);

      setAuctionTurnOffset(newAuctionStarterIndex);
      setActivePlayerIndex(0); 
      setHighestBidder(null);
      setActiveBidders(players.map(() => true));
      setCurrentCardIndex(0);
      
      setPlayers(updatedPlayers);
      setAwaitingCardPayment(false);
      setSelectedPaymentCards([]);
      setCurrentBid(0);
      

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
      });

      if (updatedDiscardPile.length === 0) 
      {
        console.log("🎯 No more cards — transitioning to scoring phase.");
        setPhase("scoring");
        broadcastState({
          discardPile: [],
          phase: "scoring",
        });
      }
    };

    return (
      <div>
        <h3>{goldWinner.player.name}, select {goldWinner.bid} cards to discard:</h3>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {goldWinner.player.hand.map((card, idx) => (
            <div
              key={idx}
              onClick={() => toggleCardSelection(card, idx)}
              style={{
                border: selectedPaymentCards.some((c) => c.idx === idx)
                  ? "2px solid red"
                  : "1px solid gray",
                margin: "5px",
                cursor: isDiscardingPlayer ? "pointer" : "not-allowed",
                opacity: idx === goldWinner.player.hand.length - 1 ? 0.5 : 1, // dim the new card
                pointerEvents: isDiscardingPlayer ? "auto" : "none",
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
      <Card {...currentCard} locked_back_flip={!isCurrentPlayer} />
      <p>
        Current Bid: {currentBid} by{" "}
        {highestBidder != null ? biddingOrder[highestBidder].name : "None"}
      </p>
      <p style={{ fontWeight: "bold", fontSize: "1.2rem" }}>
      👉 {player.name}'s turn to bid
    </p>

    <p>Gold: {player.gold}, Cards: {player.hand.length}</p>

      {player.name === playerName && (
  <>
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
    const isInvalid = bidInput === "" || isNaN(parsed) || parsed < 0;

    if (isInvalid) {
      alert("Please enter a valid number.");
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
  </>
)}

    </div>
  );
};

export default AuctionPhase;