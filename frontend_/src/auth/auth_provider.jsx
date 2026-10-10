import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./auth_context";

// The only place in the frontend that asks the server who the player is.
// A missing, unknown or expired Session answers 401, which means Guest.
async function fetchCurrentUsername() {
  const response = await fetch("/api/current-user", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  return data.username || null;
}

const AuthProvider = ({ children }) => {
  const [username, setUsername] = useState(null);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    let nextUsername = null;
    try {
      nextUsername = await fetchCurrentUsername();
    } catch (error) {
      console.error("Could not ask /api/current-user, treating as Guest:", error);
    }
    // Only the most recent request may update state, so an older, slower answer
    // can't overwrite a newer one (e.g. the app-load check finishing after sign-in).
    if (requestId === latestRequest.current) {
      setUsername(nextUsername);
      setLoading(false);
    }
    return nextUsername;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ username, isSignedIn: username !== null, loading, refresh }),
    [username, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
