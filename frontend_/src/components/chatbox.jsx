import React, { useState, useEffect, useRef } from "react";
import socket from "../socket";
import "./game_layout.css"; // Make sure the path matches your file structure

const ChatBox = ({ room, playerName }) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const [minimized, setMinimized] = useState(false);


  useEffect(() => {
    const handleMessage = ({ playerName, message }) => {
      setMessages((prev) => [...prev, { playerName, message }]);
    };

    socket.on("chat_message", handleMessage);

    return () => {
      socket.off("chat_message", handleMessage);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    socket.emit("chat_message", { room, playerName, message: input });
    setInput("");
  };

  return minimized ? (
  <button
    onClick={() => setMinimized(false)}
    style={{
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: 1000,
      padding: "8px 12px",
      backgroundColor: "#444",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer"
    }}
  >
    Show Chat
  </button>
) : (
  <div className="game-chat">
    <div className="chat-header">
      Room Chat
      <button
        onClick={() => setMinimized(true)}
        style={{
          marginLeft: "10px",
          fontSize: "12px",
          padding: "2px 6px",
          cursor: "pointer",
          float: "right",
          backgroundColor: "#444",
          color: "#fff",
          border: "none",
          borderRadius: "4px"
        }}
      >
        Hide
      </button>
    </div>

    <div className="chat-messages">
      {messages.map((m, i) => (
        <p key={i}>
          <strong>{m.playerName}:</strong> {m.message}
        </p>
      ))}
      <div ref={messagesEndRef} />
    </div>
    <div className="chat-input">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        placeholder="Send a message"
      />
      <button onClick={sendMessage}>➤</button>
    </div>
  </div>
);


};

export default ChatBox;