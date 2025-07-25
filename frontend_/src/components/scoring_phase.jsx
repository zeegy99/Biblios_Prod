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
        newLog.push(`Tie on ${die.resource_type}. No points awarded.`);
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

    if (pointLeaders.length === 1) {
      newLog.push(`🏆 ${pointLeaders[0].name} wins the game!`);
    } else {
      const maxGold = Math.max(...pointLeaders.map((p) => p.gold));
      const goldWinners = pointLeaders.filter((p) => p.gold === maxGold);
      if (goldWinners.length === 1) {
        newLog.push(`🏆 ${goldWinners[0].name} wins by gold tiebreaker!`);
      } else {
        newLog.push(`🏆 Tie between: ${goldWinners.map((p) => p.name).join(", ")}`);
      }
    }

    setLog((prev) => [...prev, ...newLog]);
    setFinalResults(finalPlayers);
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
