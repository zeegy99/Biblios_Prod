import React, { useState, useEffect, useRef } from "react";
import socket from "../socket";
import "./game_layout.css";

const ChatBox = ({ room, playerName, onHide }) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

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

  return (
    <div className="game-chat-inner">
      <div className="chat-header">
        <strong>Room Chat</strong>
        <button
          onClick={onHide}
          style={{
            float: "right",
            fontSize: "12px",
            padding: "2px 6px",
            marginLeft: "8px",
            backgroundColor: "#444",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
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
