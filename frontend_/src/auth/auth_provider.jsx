import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./auth_context";

// The only place in the frontend that asks the server who the player is.
// Resolves to the username, or null when the server answers 401 (no, unknown
// or expired Session: a Guest). Throws on anything else (network error, 5xx),
// because then we don't know who the player is.
async function fetchCurrentUsername() {
  const response = await fetch("/api/current-user", {
    method: "GET",
    credentials: "include",
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`/api/current-user answered ${response.status}`);
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
    try {
      const nextUsername = await fetchCurrentUsername();
      // Only the most recent request may update state, so an older, slower answer
      // can't overwrite a newer one (e.g. the app-load check finishing after sign-in).
      if (requestId === latestRequest.current) {
        setUsername(nextUsername);
      }
      return nextUsername;
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
      }
    }
  }, []);

  // Sign-out: ends this Session on the server, then asks who we are again.
  const signOut = useCallback(async () => {
    const response = await fetch("/api/signout", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`/api/signout answered ${response.status}`);
    }
    return refresh();
  }, [refresh]);

  useEffect(() => {
    refresh().catch((error) => {
      console.error("Could not ask /api/current-user:", error);
    });
  }, [refresh]);

  const value = useMemo(
    () => ({ username, isSignedIn: username !== null, loading, refresh, signOut }),
    [username, loading, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
