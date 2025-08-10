

export const Bot = {
  donation_phase({ currentCard, specialCard, kept, discarded, shared, cardsToProcess}) {

    console.log("🤖 Bot received donation context:");
    console.log("  Current card:", currentCard);
    console.log("  Special card:", specialCard);
    console.log("  Kept:", kept);
    console.log("  Discarded:", discarded);
    console.log("  Shared:", shared);
    console.log("  Remaining cards to assign:", cardsToProcess);

    // Return a random action (ignoring context for now)
    const choices = ["keep", "discard", "pool"];
    const i = Math.floor(Math.random() * choices.length);
    return choices[i];
  },

  shared_selection({ sharedPool }) {
    const i = Math.floor(Math.random() * sharedPool.length);
    console.log("I am in shared_selection and this was sharedPool", sharedPool, "This is i", i)
    return i;
  },

  auction({ currentBid, gold }) {
    if (gold <= currentBid) return null; 
    return currentBid + 1; 
  }
};

export default Bot;
