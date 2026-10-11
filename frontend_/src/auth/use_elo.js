import { useEffect, useState } from "react";
import { useAuth } from "./auth_context";

// The Signed-in Player's Elo, fetched from /api/get_elo for the username in
// useAuth(). null while loading or for a Guest, "N/A" when the server has no
// Elo for the account, "Error" when the request fails.
export function useElo() {
  const { username, isSignedIn } = useAuth();
  const [elo, setElo] = useState(null);

  useEffect(() => {
    if (!isSignedIn) {
      setElo(null);
      return;
    }

    // Ignore an answer that arrives after the player has changed.
    let current = true;
    fetch("/api/get_elo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (current) setElo(data.elo ?? "N/A");
      })
      .catch((err) => {
        console.error("Failed to fetch elo:", err);
        if (current) setElo("Error");
      });

    return () => {
      current = false;
    };
  }, [isSignedIn, username]);

  return elo;
}
