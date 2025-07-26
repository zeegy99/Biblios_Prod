import React from "react";
import { useParams } from "react-router-dom";
import GameRunner from "./game_manager";
import ChatBox from "./chatbox";
import "./game_layout.css";

const Play = ({ playerName, playerList }) => {

  const { room } = useParams();
  return (
    <div className="game-container">
      <div className="game-main">
        <GameRunner playerName={playerName} />
      </div>
      {/* <div className="game-chat">
        <ChatBox room={room} playerName={playerName} />
      </div> */}
    </div>
  );
};

export default Play;
