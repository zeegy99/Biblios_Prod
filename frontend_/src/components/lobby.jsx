import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";
import "./lobby.css";
import RulesPage from "./rulespage"; 
import { getOrCreatePlayerId } from "../utils/playerId";
import Fart from "../sound/fart-5-228245.mp3";

const playerId = getOrCreatePlayerId();


const Lobby = ({ playerName, setPlayerName }) => {
  const [players, setPlayers] = useState([]);
  const navigate = useNavigate();
  const room = localStorage.getItem("roomCode") || "biblios";
  const [showBox, setShowBox] = useState(false);
  const [rulesPage, setRulesPage] = useState(false);
  const [tempName, setTempName] = useState(playerName);

  //Lettig players adjust cards 
  // Dynamically scaling deck card values based on player count
const [gold1, setGold1] = useState(0);
const [gold2, setGold2] = useState(0);
const [gold3, setGold3] = useState(0);
const [res1, setRes1] = useState(0);
const [res2, setRes2] = useState(0);
const [res3, setRes3] = useState(0);
const [res4, setRes4] = useState(0);
const [hasManuallyAdjusted, setHasManuallyAdjusted] = useState(false);
const [showCardSettings, setShowCardSettings] = useState(false);
const [updateMessage, setUpdateMessage] = useState("");


useEffect(() => {
  if (hasManuallyAdjusted) return;

  const defaultGold = { 1: 5, 2: 5, 3: 5 };
  const defaultResource = { 1: 5, 2: 4, 3: 2, 4: 2 };

  let scalingFactor = 1;

  if (players.length >= 5) {
    scalingFactor = 1 + (players.length - 4) * 0.25;  
  }

  setGold1(Math.round(defaultGold[1] * scalingFactor));
  setGold2(Math.round(defaultGold[2] * scalingFactor));
  setGold3(Math.round(defaultGold[3] * scalingFactor));

  setRes1(Math.round(defaultResource[1] * scalingFactor));
  setRes2(Math.round(defaultResource[2] * scalingFactor));
  setRes3(Math.round(defaultResource[3] * scalingFactor));
  setRes4(Math.round(defaultResource[4] * scalingFactor));
}, [players.length, hasManuallyAdjusted]);




  const applyCardSettings = () => {
  const deckSettings = {
    gold: { 1: gold1, 2: gold2, 3: gold3 },
    resource: { 1: res1, 2: res2, 3: res3, 4: res4 },
  };

  socket.emit("update_deck_settings", { room, deckSettings });

    setUpdateMessage("Deck successfully updated!");

  // Optional: auto-hide after 3 seconds
  setTimeout(() => setUpdateMessage(""), 3000);
};

  

  useEffect(() => {
    const hasJoined = sessionStorage.getItem("hasJoined");

     if (!hasJoined) {
    socket.emit("join_game", { room, playerName, playerId });
    sessionStorage.setItem("hasJoined", "true");
  }


  socket.on("player_list", (updatedPlayers) => {
    // console.log("📡 Received player list:", updatedPlayers);
    setPlayers(updatedPlayers);
  });

  socket.on("start_game", (data) => {
  console.log("📩 start_game received in lobby:", data);
  localStorage.setItem("start_game_payload", JSON.stringify(data));
  localStorage.setItem("playerName", playerName);
  setPlayerName(playerName);

  // ⏳ Give localStorage a moment to flush before navigating
  setTimeout(() => {
    console.log("🚪 Navigating to /game...");
    navigate(`/game/${room}`);
  }, 50);  // 50ms is usually enough
});


  socket.on("game_state", (data) => {
    console.log("✅ game_state received in lobby. Navigating to game...");
    localStorage.setItem("playerName", playerName);
    navigate("/game");
  });

  return () => {
    socket.off("player_list");
    socket.off("start_game");
    socket.off("game_state");
  };
}, [playerName]);

  const handleStartGame = () => 
  {
    

    const deckSettings = 
    {
      gold: { 1: gold1, 2: gold2, 3: gold3 },
      resource: { 1: res1, 2: res2, 3: res3, 4: res4 },
    };
    console.log("Start Game button clicked with deckSettings", deckSettings);
    socket.emit("start_game", { room: room, deckSettings });
  };


  const toggleDropDown = () => {
    setShowBox((prev) => !prev);
  }

  const toggleRulesPage = () => {
    setRulesPage((prev) => {
    return !prev;
  });
  }

  const playFartSound = () => {
    console.log("button")
  const audio = new Audio(Fart); // path is relative to public/
  audio.volume=0.3;
  audio.play().catch((err) => {
    console.error("Failed to play fart sound:", err);
  });
};

  const updateName = () => {
  if (tempName.trim()) {
    setPlayerName(tempName.trim());
    localStorage.setItem("playerName", tempName.trim());

    // Optional: re-emit join_game with new name
    socket.emit("update_name", { room, newName: tempName.trim() });

    setShowBox(false); // Close dropdown after update
    } 
  };

  const isHost = players.length > 0 && players[0].name === playerName;

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>Waiting Room</h2>
      <p>Room: <strong>{room}</strong></p>
      <h3>Players Joined:</h3>
      <ul style = {{listStyle: "none"}}>
        {players.map((p, i) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
      {players.length < 2 ? (
        <p>Waiting for more players...</p>
      ) : isHost ? (
        <>
          <button onClick={handleStartGame}>Start Game</button>

          <br></br>

          <button
            className="deck-settings"
            onClick={() => setShowCardSettings((prev) => !prev)}
          >
            {showCardSettings ? "Hide Deck Settings" : "Show Deck Settings"}
          </button>

            {showCardSettings && (

              <div className="card-selection-box">

  <p className="nickname">Adjust the deck composition</p>

  <label>Gold cards (value 1):</label>
  <input
  type="number"
  min="0"
  value={gold1}
  onChange={(e) => {
    const val = e.target.value;
    if (val === "") {
      setGold1(""); 
    } else {
      setGold1(Math.max(0, Number(val)));
    }
    setHasManuallyAdjusted(true);
  }}
/>


  <label>Gold cards (value 2):</label>
  <input
  type="number"
  min="0"
  value={gold2}
  onChange={(e) => {
    const val = e.target.value;
    if (val === "") {
      setGold2("");
    } else {
      setGold2(Math.max(0, Number(val))); 
    }
    setHasManuallyAdjusted(true);
  }}
/>

  <label>Gold cards (value 3):</label>
  <input
  type="number"
  min="0"
  value={gold3}
  onChange={(e) => {
    const val = e.target.value;
    if (val === "") {
      setGold3(""); 
    } else {
      setGold3(Math.max(0, Number(val)));
    }
    setHasManuallyAdjusted(true);
  }}
/>

  <label>Resource cards (value 1):</label>
  <input
  type="number"
  min="0"
  value={res1}
  onChange={(e) => {
    const val = e.target.value;
    if (val === "") {
      setRes1(""); 
    } else {
      setRes1(Math.max(0, Number(val))); 
    }
    setHasManuallyAdjusted(true);
  }}
/>

  <label>Resource cards (value 2):</label>
  <input
  type="number"
  min="0"
  value={res2}
  onChange={(e) => {
    const val = e.target.value;
    if (val === "") {
      setRes2(""); 
    } else {
      setRes2(Math.max(0, Number(val))); 
    }
    setHasManuallyAdjusted(true);
  }}
/>

  <label>Resource cards (value 3):</label>
  <input
  type="number"
  min="0"
  value={res3}
  onChange={(e) => {
    const val = e.target.value;
    if (val === "") {
      setRes3(""); 
    } else {
      setRes3(Math.max(0, Number(val))); 
    }
    setHasManuallyAdjusted(true);
  }}
/>

  <label>Resource cards (value 4):</label>
  <input
  type="number"
  min="0"
  value={res4}
  onChange={(e) => {
    const val = e.target.value;
    if (val === "") {
      setRes4(""); 
    } else {
      setRes4(Math.max(0, Number(val))); 
    }
    setHasManuallyAdjusted(true);
  }}
/>

  <br />
  <button className="normal-button" onClick={applyCardSettings}>
    Apply Settings
  </button>

  {updateMessage && (
  <div style={{ marginTop: "20px", color: "green", textAlign: "center" }}>
    {updateMessage}
  </div>
)}
</div>
            )}
          
        
        </>
        
      ) : (
        <p>Waiting for host to start the game...</p>
      )}

      <div className="button-bar">

        <button className={'menu-button'} onClick={playFartSound}>
        Button
      </button>

        <button className={'menu-button'} onClick={toggleRulesPage}>
        Rules
      </button>

         <button className={'naming-button'} onClick={toggleDropDown}>
        {playerName}
      </button>

      


      </div>

     

      {showBox && (
        <div className={'dropdown-box'}>
          <p className="nickname">Nickname</p>
          <input className="nickname-input"
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            placeholder="Enter your nickname"
          />
          <br></br>

          <button className={'normal-button'} onClick={updateName}>
            Update your nickname
          </button>
  
        </div>
        
      )}

      {rulesPage && <RulesPage onClose={() => setRulesPage(false)} />}

      <br></br>

      
    </div>
  );
};

export default Lobby;
