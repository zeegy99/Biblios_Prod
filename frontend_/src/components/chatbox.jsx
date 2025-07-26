import React, { useState, useEffect } from "react";
import socket from "../socket";

const ChatBox = ({ room, playerName }) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    console.log("💡 ChatBox mounted for", playerName);

    // 👇 Clear old listener before adding new one
    socket.off("chat_message");

    const listener = ({ playerName, message }) => {
      console.log("📥 Received message:", message);
      setMessages((prev) => [...prev, { playerName, message }]);
    };

    socket.on("chat_message", listener);
    console.log("📥 Listening for chat_message");

    return () => {
      console.log("🧼 ChatBox unmounted for", playerName);
      socket.off("chat_message", listener);  // cleanup
    };
  }, [playerName]); // re-run if playerName changes

  const sendMessage = () => {
    if (input.trim() === "") return;

    console.log("📤 Emitting chat_message:", input, room, playerName);
    socket.emit("chat_message", { room, playerName, message: input });
    setInput("");
  };

  return (
    <div style={{ border: "1px solid gray", padding: "10px", maxWidth: 400 }}>
      <h4>Chat</h4>
      <div style={{ maxHeight: 150, overflowY: "auto" }}>
        {messages.map((m, i) => (
          <p key={i}>
            <strong>{m.playerName}:</strong> {m.message}
          </p>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        placeholder="Type a message"
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
};

export default ChatBox;
