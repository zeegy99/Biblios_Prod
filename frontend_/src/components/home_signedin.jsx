import React, {useState, useEffect} from "react";
import { Navigate, useNavigate } from "react-router-dom";
import "./lobby.css";
import RulesPage from "./rulespage"; 
import { useAuth } from "../auth/auth_context";
import SignOutButton from "../auth/sign_out_button";


const SignedIn = () => {
  const { username, isSignedIn, loading } = useAuth();
  const savedName = localStorage.getItem("playerName") || username;
  const [elo, setElo] = useState(null);
  const navigate = useNavigate();
  const [showBox, setShowBox] = useState(false);
  const [rulesPage, setRulesPage] = useState(false);
  const [roomInput, setRoomInput] = useState("");

const handleRejoin = () => {
  const playerName = localStorage.getItem("playerName") || username;
  const prevRoomCode = localStorage.getItem("prevRoomCode")
  const roomCode = localStorage.getItem("roomCode") || prevRoomCode;
  

  if (!isSignedIn || !playerName || !roomCode) {
    alert("No game to rejoin.");
    return;
  }
  // The game screen asks the server for this Seat back (rejoin_game { room },
  // by the Session of the connection) when it opens without a start payload.
  navigate(`/game/${roomCode}`);
};

const handleJoin = (e) => {
  e.preventDefault();
  if (!roomInput) return;
  localStorage.setItem("roomCode", roomInput.toUpperCase());
  navigate("/lobby");
};

useEffect(() => {
    const handleEsc = (event) => {
       if (event.key === 'Escape') {
        console.log('Close')
      }
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);
useEffect(() => {
  if (!isSignedIn) return;

  fetch("/api/get_elo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim() })
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
}, [isSignedIn, username]);

const handleCreateRoom = () => {
  const newRoom = Math.random().toString(36).substring(2, 7).toUpperCase();
  localStorage.setItem("roomCode", newRoom);
  navigate("/lobby");
};


  if (loading) {
    return null;
  }
  if (!isSignedIn) {
    return <Navigate to="/" replace />; // redirect guests to home
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

            <button
           className="login-header"
            onClick={() => navigate("/settings")}
            style={{ backgroundColor: "#9694FF", color: "white" }}
          >
            Settings
          </button>

          <button
           className="login-header"
            onClick={() => navigate("/leaderboard")}
            style={{ backgroundColor: "#9694FF", color: "white" }}
          >
            Leaderboard
          </button>

        

          

          <button className="login-header" onClick={toggleRulesPage}
           style={{ backgroundColor: "#9694FF", color: "white" }}>
            Rules
          </button>

          {rulesPage && <RulesPage onClose={() => setRulesPage(false)} />}
          
          

          <button className={'naming-button'} onClick={toggleDropDown}>
          {username}
          </button>

          {showBox && (
            <div className="profile-dropdown">
              <p className="profile-label">You are logged in as:</p>
              <h3 className="profile-name">{username} 

                
              </h3>

              <p className="profile-label"> current alias: {savedName}</p>
            


              <p className="profile-label" style={{ marginTop: "8px", fontSize: "14px" }}>
                ELO Rating: <strong>{elo} LP</strong>
              </p>

              <hr className="profile-divider" />

              <SignOutButton />
            </div>
          )}
        
          
        </div>
        
      </header>

      <main className="home-main">
  <div className="home-card left-card">
     <h2 className="home-title">Welcome back, {username}!</h2>
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
