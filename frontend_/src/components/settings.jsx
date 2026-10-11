import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth_context";
import SignOutButton from "../auth/sign_out_button";
import RulesPage from "./rulespage";
import RejoinButton from "./rejoin_button";
import "./leaderboard.css";
import "./settings.css";
import {DEFAULT_KEYBINDS} from "./keybinds_defaults.js";
import Fart from "../sound/fart-5-228245.mp3";



export let updatedSettings = { ...DEFAULT_KEYBINDS };

export function setUpdatedSettings(newMap) {
  updatedSettings = newMap;
  // console.log("I have run, I am updatedSettings", updatedSettings)
}


const Settings = () => {
  const [changingAction, setChangingAction] = useState(null);
  const [volume, setVolume] = useState(50);
  const { username, isSignedIn } = useAuth();
  const savedName = localStorage.getItem("playerName");
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



  const sendKeybinds = () => {
    fetch("/api/send_keybinds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ settings: updatedSettings })
      })

      console.log("finished the sendKeybinds", updatedSettings)
  }

  useEffect(() => {
    // console.log("I literally do nothing")
    // console.log(DEFAULT_KEYBINDS)
    for (let i = 0; i < Object.values(DEFAULT_KEYBINDS).length; i++) {
      // console.log(Object.keys(DEFAULT_KEYBINDS)[i], Object.values(DEFAULT_KEYBINDS)[i])
    }

   
  }, [])


  



  const handleRebind = (action) => {
    setChangingAction(action);
    const listener = (e) => {
      e.preventDefault();
      const newKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      setkeybindStateMap((prev) => {
        const updated = { ...prev };
        const existingAction = Object.entries(prev).find(
          ([a, k]) => Array.isArray(k) && k[0] === newKey && a !== action
        );
        if (existingAction) {
          updated[existingAction[0]] = null;
        }
        updated[action] = [newKey];
        return updated;
      });
      setChangingAction(null);
      window.removeEventListener("keydown", listener);
    };
    window.addEventListener("keydown", listener);
  };

  const [keybindStateMap, setkeybindStateMap] = useState({
    DONATE_CARD: donateCard,
    DISCARD_CARD: discardCard,
    KEEP_CARD: keepCard,
    OPEN_CHAT: openChat,
    BID_INCREASE: bidIncrease,
    BID_DECREASE: bidDecrease,
    PASS_BID: passBid,
    TAKE_CARD_1: takeCard1,
    TAKE_CARD_2: takeCard2,
    TAKE_CARD_3: takeCard3,
    TAKE_CARD_4: takeCard4,
    PLACE_BID: DEFAULT_KEYBINDS["PLACE_BID"],
    UPDATE_DICE_1: DEFAULT_KEYBINDS["UPDATE_DICE_1"], 
    UPDATE_DICE_2: DEFAULT_KEYBINDS["UPDATE_DICE_2"], 
    UPDATE_DICE_3: DEFAULT_KEYBINDS["UPDATE_DICE_3"],
    UPDATE_DICE_4: DEFAULT_KEYBINDS["UPDATE_DICE_4"],
    UPDATE_DICE_5: DEFAULT_KEYBINDS["UPDATE_DICE_5"],
    UPDATE_DICE_6: DEFAULT_KEYBINDS["UPDATE_DICE_6"],
    INCREASE_DICE: DEFAULT_KEYBINDS["INCREASE_DICE"],
    DECREASE_DICE: DEFAULT_KEYBINDS["DECREASE_DICE"],
  });

  const restoreDefaults = () => {
    setkeybindStateMap(DEFAULT_KEYBINDS);
  };
  
  return (
    <div className="leaderboard-page">
      <header className="home-header">
        <div className="logo">BIBLIOS</div>
        <div className="nav-buttons">
          <RejoinButton />

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

          {showBox && isSignedIn && (
            <div className="profile-dropdown">
              <p className="profile-label" style={{marginLeft: "50px"}}>You are logged in as:</p>
              <h3 className="profile-name">{username}</h3>
              
              <hr className="profile-divider" />
              <SignOutButton style={{marginLeft: "30px"}} />
            </div>
          )}
        </div>
      </header>
          
          <h1> WORK IN PROGRESS. IF ANYONE FINDS A GOOD SETTINGS PAGE ON GITHUB LMK</h1>
      <p>Current username: {isSignedIn ? username : "Guest"} </p>
      <p>Current email: ur the goat{}</p>
      <p>Volume:  </p>
      <div className="slidecontainer">
            <input
              type="range"
              min="0"
              max="100"
              value={localStorage.getItem("Volume")}
              onChange={(e) => {setVolume(e.target.value); localStorage.setItem("Volume",e.target.value)}} 
              className="slider"
              id="myRange"
            />
          <p>Volume: <span>{localStorage.getItem("Volume")}</span>%</p>
        </div>

      <button 
      onClick={() => {
        const tick = new Audio(Fart);
        tick.volume = (localStorage.getItem("Volume") / 100);
        tick.play();
      }
      }>
        Test Volume
      </button>


      <p>Keybinds: (Please Note, The changes currently do nothing, JK JEANS IS ON THE CASE)</p>
    

    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Keybind Settings</h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {Object.entries(keybindStateMap).map(([action, key]) => (
          <div
            key={action}
            className="flex items-center justify-between bg-gray-100 p-3 rounded-lg shadow-sm"
          >
            <span className="font-medium">{action}</span>
            <button
              onClick={() => handleRebind(action)}
              className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
            >
              {changingAction === action 
                ? "Changing..." 
                : key || "Unbound"}

            </button>
          </div>
        ))}
      </div>
    </div>
     
      <button onClick={() => {
          console.log("You have reset keybinds and this was old keybinds", keybindStateMap)
          setkeybindStateMap(DEFAULT_KEYBINDS)
          console.log("We have reset the keybinds", keybindStateMap)
          restoreDefaults()
      }
      }>
        Reset Default Keybinds
      </button>


      {isSignedIn && <button onClick={sendKeybinds}>Confirm keybinds</button>}

    </div>


  );

  
};

export default Settings;
