
import React, { useState } from "react";
import { useParams } from "react-router-dom";
import GameRunner from "./game_manager";
import ChatBox from "./chatbox";
import "./game_layout.css";

const Play = ({ playerName, playerList }) => {
  const [chatVisible, setChatVisible] = useState(true);
  const [messages, setMessages] = useState([]);

  const { room } = useParams();
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
