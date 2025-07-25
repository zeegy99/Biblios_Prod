// src/utils/deck.js

export function buildDeck() {
  const card_q = { 1: 5, 2: 4, 3: 2, 4: 2 }; //{ 1: 5, 2: 4, 3: 2, 4: 1 }
  const resourceTypes =["Religion", "Science", "Military", "Art", "Herbs"]; //["Religion", "Science", "Military", "Art", "Herbs"]
  const tieBreakers = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
  const deck = [];

  for (const res of resourceTypes) {
    for (const [val, quantity] of Object.entries(card_q)) {
      for (let i = 0; i < quantity; i++) {
        const tie = tieBreakers[Math.floor(Math.random() * tieBreakers.length)];
        deck.push({
          value: parseInt(val),
          type: res,
          tieBreaker: tie,
          isSpecial: false,
        });
      }
    }
  }

  // Add Gold cards: 5 of each value (1–3) = 15 total
  for (let i = 0; i < 6; i++) {
    for (let k = 1; k <= 3; k++) {
      deck.push({
        value: k,
        type: "Gold",
        tieBreaker: "N",
        isSpecial: false,
      });
    }
  }

  // 2 of each special card type: Plus, Minus, Both
  for (let j = 1; j < 3; j++) {
    ["Plus", "Minus", "Both"].forEach(type => {
      deck.push({
        value: j,
        type,
        isSpecial: true
      });
    });
  }

  shuffle(deck);
  return deck;
}

export function buildSmallDeck() {
  const card_q = { 1: 2, 2: 1, 3: 0, 4: 0 };
  const resourceTypes = ["Religion", "Science", "Military", "Art", "Herbs"];
  const tieBreakers = ["A", "B", "C", "D"];
  const deck = [];

  for (const res of resourceTypes) {
    for (const [val, quantity] of Object.entries(card_q)) {
      for (let i = 0; i < quantity; i++) {
        const tie = tieBreakers[Math.floor(Math.random() * tieBreakers.length)];
        deck.push({
          value: parseInt(val),
          type: res,
          tieBreaker: tie,
          isSpecial: false,
        });
      }
    }
  }

  // 3 Gold cards: values 1 and 2 only
  for (let i = 0; i < 3; i++) {
    for (let k = 1; k <= 2; k++) {
      deck.push({
        value: k,
        type: "Gold",
        tieBreaker: "None",
        isSpecial: false,
      });
    }
  }

  // One of each special
  ["Plus", "Minus", "Both"].forEach(type => {
    deck.push({
      value: 2,
      type,
      isSpecial: true
    });
  });

  shuffle(deck);
  return deck;
}

// Utility function
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}
