import React, {useState, useEffect} from "react";
import { useNavigate } from "react-router-dom";
import "./lobby.css";
import RulesPage from "./rulespage"; 

const SignedIn = () => {
  const savedName = localStorage.getItem("playerName");
  const [elo, setElo] = useState(null);
  const isGuest = localStorage.getItem("isGuest") === "true";
  const navigate = useNavigate();
  const [showBox, setShowBox] = useState(false);
  const [rulesPage, setRulesPage] = useState(false);
  const [roomInput, setRoomInput] = useState("");

const handleRejoin = () => {
  const playerId = localStorage.getItem("playerId");
  const playerName = localStorage.getItem("playerName");
  const roomCode = localStorage.getItem("roomCode");

  if (!playerId || !playerName || !roomCode) {
    alert("No game to rejoin.");
    return;
  }

  // Emit rejoin request
  socket.emit("rejoin_game", {
    room: roomCode,
    playerId,
    playerName,
  });

  // Navigate back to the game
  navigate(`/game/${roomCode}`);
};

const handleJoin = (e) => {
  e.preventDefault();
  if (!roomInput) return;
  localStorage.setItem("roomCode", roomInput.toUpperCase());
  navigate("/lobby");
};

useEffect(() => {
  const username = localStorage.getItem("playerName");

  console.log("username", username)

  if (username) {
    const cleanUsername = username.trim();
    fetch("https://biblios-backend.onrender.com/api/get_elo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: cleanUsername })
    })
      .then(res => res.json())
      .then(data => {
        if (data.elo !== undefined) {
          setElo(data.elo);
        } else {
          console.warn("No elo found:", data);
          setElo("N/A");
        }
      })
      .catch(err => {
        console.error("Failed to fetch elo:", err);
        setElo("Error");
      });
  }
}, []);

const handleCreateRoom = () => {
  const newRoom = Math.random().toString(36).substring(2, 7).toUpperCase();
  localStorage.setItem("roomCode", newRoom);
  navigate("/lobby");
};


  if (isGuest) {
    navigate("/"); // redirect guests to home
    return null;
  }
  const toggleDropDown = () => {
    setShowBox((prev) => !prev);
  }

  const toggleRulesPage = () => {
    setRulesPage((prev) => {
    return !prev;
  });
  }

  const toLobby = () => {
    navigate("/lobby");
  };

  return (
    <div className="home-container">
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

          <button className="login-header" onClick={toggleRulesPage}>
            Rules
          </button>

          {rulesPage && <RulesPage onClose={() => setRulesPage(false)} />}

          <button className={'naming-button'} onClick={toggleDropDown}>
          {savedName}
          </button>

          {showBox && (
            <div className="profile-dropdown">
              <p className="profile-label">You are logged in as:</p>
              <h3 className="profile-name">{savedName}</h3>

              <p className="profile-label" style={{ marginTop: "8px", fontSize: "14px" }}>
                ELO Rating: <strong>{elo} LP</strong>
              </p>

              <hr className="profile-divider" />

              <button
                className="profile-signout"
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

      <main className="home-main">
  <div className="home-card left-card">
     <h2 className="home-title">Welcome back, {savedName}!</h2>
    <h2>Join or Create a Room</h2>

    <input
      className="home-input"
      type="text"
      placeholder="Enter Room Code"
      value={roomInput}
      onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
    />

    <button className="home-button" onClick={handleJoin}>
      Join Room
    </button>

    <div className="divider">or</div>

    <button className="home-button" onClick={handleCreateRoom}>
      🎲 Create Random Room
    </button>
  </div>
</main>

        
      

    </div>
  );
};

export default SignedIn;
