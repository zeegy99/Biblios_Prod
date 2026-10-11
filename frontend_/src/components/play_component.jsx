
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import socket from "../socket";
import GameRunner from "./game_manager";
import ChatBox from "./chatbox";
import "./game_layout.css";

const Play = ({ playerName, playerList }) => {
  const [chatVisible, setChatVisible] = useState(true);
  const [messages, setMessages] = useState([]);

  const { room } = useParams();
  const navigate = useNavigate();

  // A Rejoin the server couldn't match to a seat: there is no game to show.
  useEffect(() => {
    const handleRejoinFailed = () => {
      alert("No game to rejoin.");
      navigate("/");
    };
    socket.on("rejoin_failed", handleRejoinFailed);
    return () => socket.off("rejoin_failed", handleRejoinFailed);
  }, [navigate]);

  return (
    <div className="game-container">
      <div className="game-main">
        <GameRunner playerName={playerName} />
      </div>
      {chatVisible ? (
  <div className="game-chat">
    
    <ChatBox 
      room={room} 
      playerName={playerName} 
      onHide={() => setChatVisible(false)} 
      messages={messages}
      setMessages={setMessages}
      
    />
  </div>
) : (
  <button
    onClick={() => setChatVisible(true)}
    className="chat-toggle-button"
    style={{
      position: "fixed",
      bottom: "10px",
      right: "10px",
      zIndex: 999,
    }}
  >
    Show Chat
  </button>
)}


    </div>
  );
};

export default Play;
