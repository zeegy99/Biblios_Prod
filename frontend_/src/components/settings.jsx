import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RulesPage from "./rulespage";
import "./leaderboard.css";
import "./settings.css";
import {DEFAULT_KEYBINDS} from "./keybinds_defaults.js";


export let updatedSettings = { ...DEFAULT_KEYBINDS };

export function setUpdatedSettings(newMap) {
  updatedSettings = newMap;
  // console.log("I have run, I am updatedSettings", updatedSettings)
}


const Settings = () => {
  const login_info = localStorage.getItem("signin_username") || "none";
  const savedName = localStorage.getItem("playerName");
  const [elo, setElo] = useState(null);
  const isGuest = localStorage.getItem("isGuest") === "true";
  const navigate = useNavigate();
  const [showBox, setShowBox] = useState(false);
  const [rulesPage, setRulesPage] = useState(false);
  const [players, setPlayers] = useState([]);
  const [keepCard, setKeepCard] = useState(DEFAULT_KEYBINDS["KEEP_CARD"]);
  const [discardCard, setdiscardCard] = useState(DEFAULT_KEYBINDS["DISCARD_CARD"]);


  const [openChat, setopenChat] = useState(DEFAULT_KEYBINDS["OPEN_CHAT"]);
  const [bidIncrease, setbidIncrease] = useState(DEFAULT_KEYBINDS["BID_INCREASE"]);
  const [bidDecrease, setbidDecrease] = useState(DEFAULT_KEYBINDS["BID_DECREASE"]);
  const [passBid, setpassBid] = useState(DEFAULT_KEYBINDS["PASS_BID"]);
  const [donateCard, setdonateCard] = useState(DEFAULT_KEYBINDS["DONATE_CARD"]);

  const [takeCard1, settakeCard1] = useState(DEFAULT_KEYBINDS["TAKE_CARD_1"]);
  const [takeCard2, settakeCard2] = useState(DEFAULT_KEYBINDS["TAKE_CARD_2"]);
  const [takeCard3, settakeCard3] = useState(DEFAULT_KEYBINDS["TAKE_CARD_3"]);
  const [takeCard4, settakeCard4] = useState(DEFAULT_KEYBINDS["TAKE_CARD_4"]);

  const keybindStateMap = {
  KEEP_CARD: keepCard,
  DISCARD_CARD: discardCard,
  OPEN_CHAT: openChat,
  BID_INCREASE: bidIncrease,
  BID_DECREASE: bidDecrease,
  PASS_BID: passBid,
  DONATE_CARD: donateCard,
  TAKE_CARD_1: takeCard1,
  TAKE_CARD_2: takeCard2,
  TAKE_CARD_3: takeCard3,
  TAKE_CARD_4: takeCard4,
};




  useEffect(() => {
    if (!isGuest && savedName) {
      fetch("https://biblios-backend.onrender.com/api/get_elo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: savedName.trim() })
      })
        .then(res => res.json())
        .then(data => setElo(data.elo ?? "N/A"))
        .catch(() => setElo("Error"));
    }
  }, [isGuest, savedName]);

  useEffect(() => {
    console.log("I literally do nothing")
    // console.log(DEFAULT_KEYBINDS)
    for (let i = 0; i < Object.values(DEFAULT_KEYBINDS).length; i++) {
      console.log(Object.keys(DEFAULT_KEYBINDS)[i], Object.values(DEFAULT_KEYBINDS)[i])
    }

   
  }, [])


  
  const handleRejoin = () => {
    const playerId = localStorage.getItem("playerId");
    const playerName = localStorage.getItem("playerName");
    const roomCode = localStorage.getItem("roomCode");

    if (!playerId || !playerName || !roomCode) {
      alert("No game to rejoin.");
      return;
    }
    socket.emit("rejoin_game", { room: roomCode, playerId, playerName });
    navigate(`/game/${roomCode}`);
  };

  return (
    <div className="leaderboard-page" style={{marginTop: "40px"}}>
      <header className="home-header">
        <div className="logo">BIBLIOS</div>
        <div className="nav-buttons">
          <button
            className="login-header"
            style={{ backgroundColor: "#e53935", color: "white" }}
            onClick={handleRejoin}
          >
            Rejoin
          </button>

          <button
            className="login-header"
            onClick={() => navigate("/")}
            style={{ backgroundColor: "#9694FF", color: "white" }}
          >
            Home
          </button>

          <button
            className="login-header"
            onClick={() => setRulesPage(prev => !prev)}
            style={{ backgroundColor: "#9694FF", color: "white" }}
          >
            Rules
          </button>

          {rulesPage && <RulesPage onClose={() => setRulesPage(false)} />}

          <button className="naming-button" onClick={() => setShowBox(prev => !prev)}>
            {savedName}
          </button>

          {showBox && (
            <div className="profile-dropdown">
              <p className="profile-label" style={{marginLeft: "50px"}}>You are logged in as:</p>
              <h3 className="profile-name">{login_info}</h3>
              
              <hr className="profile-divider" />
              <button
                className="profile-signout" style={{marginLeft: "30px"}}
                onClick={() => {
                  localStorage.clear();
                  navigate("/");
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>
          
          <h1> WORK IN PROGRESS. IF ANYONE FINDS A GOOD SETTINGS PAGE ON GITHUB LMK</h1>
      <p>Current username: {login_info} edit png</p>
      <p>Current email: fuck u{}</p>
      <p>Volume: Unable to change</p>
      <p>Keybinds: (Please Note, The changes currently do nothing)</p>
      Keep: <input 
      className="asdf" 
      type="text" 
      value={keepCard}
      onChange={(e) => {
          localStorage.removeItem("keepCard")
          const value = e.target.value;
          setKeepCard(value.slice(0, 1));
          localStorage.setItem("keepCard", value)
        }}
      />

      Discard: <input 
      className="asdf" 
      type="text" 
      value={discardCard}
      onChange={(e) => {
          const value2 = e.target.value;
          setdiscardCard(value2.slice(0, 1));
        }}
      />

      Donate:  
      <input 
      className="asdf" 
      type="text" 
      value={donateCard}
      onChange={(e) => {
          const value3 = e.target.value;
          setdonateCard(value3.slice(0, 1));
        }}
      />

      Open Chat:  
      <input 
      className="asdf" 
      type="text" 
      value={openChat}
      onChange={(e) => {
          const value4 = e.target.value;
          setopenChat(value4.slice(0, 1));
        }}
      />

      Bid Increase:  
      <input 
      className="asdf" 
      type="text" 
      value={bidIncrease}
      onChange={(e) => {
          const value5 = e.target.value;
          setbidIncrease(value5.slice(0, 1));
        }}
      />

      Bid Decrease:  
      <input 
      className="asdf" 
      type="text" 
      value={bidDecrease}
      onChange={(e) => {
          const value6 = e.target.value;
          setbidDecrease(value6.slice(0, 1));
        }}
      />

      Pass Bid:  
      <input 
      className="asdf" 
      type="text" 
      value={passBid}
      onChange={(e) => {
          const value7 = e.target.value;
          setpassBid(value7.slice(0, 1));
        }}
      />

      Take Card 1:  
      <input 
      className="asdf" 
      type="text" 
      value={takeCard1}
      onChange={(e) => {
          const value8 = e.target.value;
          settakeCard1(value8.slice(0, 1));
        }}
      />

      Take Card 2:  
      <input 
      className="asdf" 
      type="text" 
      value={takeCard2}
      onChange={(e) => {
          const value9 = e.target.value;
          settakeCard2(value9.slice(0, 1));
        }}
      />

      Take Card 3:  
      <input 
      className="asdf" 
      type="text" 
      value={takeCard3}
      onChange={(e) => {
          const value10 = e.target.value;
          settakeCard3(value10.slice(0, 1));
        }}
      />

      Take Card 4:  
      <input 
      className="asdf" 
      type="text" 
      value={takeCard4}
      onChange={(e) => {
          const value11 = e.target.value;
          settakeCard4(value11.slice(0, 1));
        }}
      />

      <button onClick={() => {
        let updatedSet = {};
        for (const key in DEFAULT_KEYBINDS) {
          // console.log("This is key", key)
          updatedSet[key] = keybindStateMap[key]
        }
        // console.log("This is final updatedSet", updatedSet)
        console.log("run")
        setUpdatedSettings(updatedSet)
        console.log("not")

      }
      

      }>
        Confirm keybinds
      </button>


    </div>
  );
};

export default Settings;
