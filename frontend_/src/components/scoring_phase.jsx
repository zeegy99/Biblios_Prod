import React, { useEffect, useState } from "react";

const ScoringPhase = ({ players, dice, setFinalResults, goToResults, isHost }) => {
  const [log, setLog] = useState([]);
  const [currentDieIndex, setCurrentDieIndex] = useState(0);
  const [scoredPlayers, setScoredPlayers] = useState(() =>
    players.map((p) => ({ ...p, points: 0 }))
  );
  const [isDone, setIsDone] = useState(false);

  const handleScoreNextDie = () => {
    const die = dice[currentDieIndex];
    const newLog = [];
    newLog.push(`Scoring ${die.resource_type} (Die value ${die.value})`);
    console.log(`🎯 Scoring ${die.resource_type} (Die value ${die.value})`);

    let updated = scoredPlayers.map((player) => {
      let total = 0;
      let bestTie = Infinity;

      for (let card of player.hand) {
        if (card.type === die.resource_type) {
          total += card.value;
          bestTie = Math.min(bestTie, card.tie_breaker?.charCodeAt?.(0) ?? 999);
        }
      }

      return { ...player, __total: total, __bestTie: bestTie };
    });

    const max = Math.max(...updated.map((p) => p.__total));
    const contenders = updated.filter((p) => p.__total === max);

    if (contenders.length === 1) {
      contenders[0].points += die.value;
      newLog.push(`${contenders[0].name} wins ${die.resource_type} for ${die.value} points`);
    } else {
      const minTie = Math.min(...contenders.map((p) => p.__bestTie));
      const tieWinners = contenders.filter((p) => p.__bestTie === minTie);
      if (tieWinners.length === 1) {
  tieWinners[0].points += die.value;
  newLog.push(`Tiebreaker! ${tieWinners[0].name} wins ${die.resource_type}`);
} else {
  // tie-breakers also tied → split points
  const splitPoints = die.value / tieWinners.length;
  tieWinners.forEach((p) => {
    p.points += splitPoints;
  });
  newLog.push(
    `Tie-breakers also tied on ${die.resource_type}. ${splitPoints} point(s) awarded to each of: ${tieWinners
      .map((p) => p.name)
      .join(", ")}`
  );
}

    }

    // Clean up helper props
    updated = updated.map(({ __total, __bestTie, ...p }) => p);

    setScoredPlayers(updated);
    setLog((prev) => [...prev, ...newLog]);

    if (currentDieIndex + 1 >= dice.length) {
      finishScoring(updated);
    } else {
      setCurrentDieIndex(currentDieIndex + 1);
    }
  };

  const finishScoring = (finalPlayers) => {
  const newLog = [];

  const maxPoints = Math.max(...finalPlayers.map((p) => p.points));
  const pointLeaders = finalPlayers.filter((p) => p.points === maxPoints);

  let winners;
  if (pointLeaders.length === 1) {
    winners = [pointLeaders[0]];
    newLog.push(`🏆 ${winners[0].name} wins the game!`);
  } else {
    const maxGold = Math.max(...pointLeaders.map((p) => p.gold));
    winners = pointLeaders.filter((p) => p.gold === maxGold);
    if (winners.length === 1) {
      newLog.push(`🏆 ${winners[0].name} wins by gold tiebreaker!`);
    } else {
      newLog.push(`🏆 Tie between: ${winners.map((p) => p.name).join(", ")}`);
    }
  }

  const sorted = [...finalPlayers].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.gold - a.gold;
  });

 // 🎯 ELO calculation
const step = 10;
const isOdd = sorted.length % 2 === 1;
const median = Math.floor(sorted.length / 2);
const eloResults = [];

sorted.forEach((player, i) => {
  let gain = 0;
  if (isOdd && i === median) {
    gain = 0; // Middle player gets 0
  } else {
    gain = step * (sorted.length - 1 - i) - step * median;
  }

  const isSignedIn = player.email; // Adjust based on how you check
  if (isSignedIn) {
    player.eloGained = gain;

    const key = `elo-${player.email}`;
    const current = parseInt(localStorage.getItem(key) || "1000");
    localStorage.setItem(key, current + gain);
  } else {
    player.eloGained = 0;
  }

  eloResults.push(`${player.name} ${gain >= 0 ? "+" : ""}${gain}`);
});


  newLog.push(`📈 ELO changes: ${eloResults.join(", ")}`);
  setLog((prev) => [...prev, ...newLog]);
  setFinalResults(sorted);
  setIsDone(true);
};



  return (
    <div>
      <h2>📊 Scoring Phase</h2>
      {log.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      {!isDone && (
        <button onClick={handleScoreNextDie} style={{ marginTop: "20px" }}>
          ➡️ Score Next ({dice[currentDieIndex]?.resource_type || "Done"})
        </button>
      )}
      {isDone && (
        <>
          <p>✅ Scoring complete!</p>
          {isHost && (
            <button onClick={goToResults} style={{ marginTop: "20px" }}>
              ➡️ Continue to Results
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default ScoringPhase;
