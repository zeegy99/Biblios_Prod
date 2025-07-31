

export const Bot = {
  donation_phase({ cardsToDistribute }) {
    const kept = cardsToDistribute[0];
    const shared = cardsToDistribute.slice(1, -1);
    const discarded = cardsToDistribute[cardsToDistribute.length - 1];
    return { kept, shared, discarded };
  },

  shared_selection({ sharedPool }) {
    const i = Math.floor(Math.random() * sharedPool.length);
    return sharedPool[i];
  },

  auction({ currentBid, gold }) {
    if (gold <= currentBid) return null; 
    return currentBid + 1; 
  }
};

export default Bot;
