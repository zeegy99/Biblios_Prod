import React from "react";
import { useParams } from "react-router-dom";
import GameRunner from "./game_manager";
import ChatBox from "./chatbox";

const Play = ({ playerName, playerList }) => {

  const { room } = useParams();
  return (
    <div>
      {/* <h1>Biblios Game</h1> */}
      <>
  <GameRunner playerName={playerName} />
  <ChatBox room={room} playerName={playerName} />
</>

    </div>
  );
};

export default Play;
