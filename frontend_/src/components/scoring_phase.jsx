import React, { useEffect, useState } from "react";

const ScoringPhase = ({ players, dice, setFinalResults, goToResults, isHost }) => {
  const [log, setLog] = useState([]);
  const username = localStorage.getItem("playerName") || "none";
  const login_info = localStorage.getItem("signin_username") || "none";
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

    console.log("This is what updated is", updated)
    const perPlayerTotalsLine = updated
      .map((p) => `${p.name}: ${p.__total}`)
      .join(", ");
    newLog.push(`Totals — ${die.resource_type}: ${perPlayerTotalsLine}`);

    const max = Math.max(...updated.map((p) => p.__total));
    const contenders = updated.filter((p) => p.__total === max);

    if (contenders.length === 1) {
      contenders[0].points += die.value;
      newLog.push(`${contenders[0].name} wins ${die.resource_type} for ${die.value} points`);
      } 
    else {
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
          `Tie-breakers also tied on ${die.resource_type}. ${splitPoints} point(s) to each: ${tieWinners
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

  
  const computeTotalsForCategory = (playersList, category) => {
    return playersList.map((p) => {
      const sum = (p.hand || []).reduce(
        (acc, c) => acc + (c.type === category ? c.value : 0),
        0
      );
      return { name: p.name, total: sum };
    });
  };

  const finishScoring = (finalPlayers) => {
    const newLog = [];

  
    const categoriesInDice = Array.from(
      new Set(dice.map((d) => d.resource_type))
    );
    categoriesInDice.forEach((cat) => {
      const totals = computeTotalsForCategory(finalPlayers, cat);
      const line = totals.map((t) => `${t.name}: ${t.total}`).join(", ");
      newLog.push(`Breakdown — ${cat}: ${line}`);
    });

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

    const step = 10;
    const numPlayers = sorted.length;
    const isOdd = numPlayers % 2 === 1;
    const medianIndex = Math.floor(numPlayers / 2);
    sorted.forEach((player, i) => {
      player.rank = i + 1;

      if (isOdd && i === medianIndex) {
        player.elo = 0;
      } else if (i < medianIndex) {
        player.elo = step * (medianIndex - i);
      } else {
        player.elo = -step * (i - medianIndex + (isOdd ? 0 : 1));
      }

      if (player.name === username) {
        fetch("https://biblios-backend.onrender.com/api/update_elo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: login_info, eloChange: player.elo })
        });
      }
    });

    const rankResults = sorted.map((p) => `${p.name}: #${p.rank}, elo: ${p.elo}`);
    newLog.push(`Final Rankings: ${rankResults.join(", ")}`);

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
