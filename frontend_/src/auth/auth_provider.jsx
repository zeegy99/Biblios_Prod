import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./auth_context";
import { reconnectSocket } from "../socket";

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
  // The username in state, readable inside runRefresh() without re-creating it.
  const currentUsername = useRef(null);

  // `initial` is true only for the app-load check below.
  const runRefresh = useCallback(async ({ initial }) => {
    const requestId = ++latestRequest.current;
    try {
      const nextUsername = await fetchCurrentUsername();
      // Only the most recent request may update state, so an older, slower answer
      // can't overwrite a newer one (e.g. the app-load check finishing after sign-in).
      if (requestId === latestRequest.current) {
        const changed = nextUsername !== currentUsername.current;
        currentUsername.current = nextUsername;
        setUsername(nextUsername);
        // The socket identified the player at its handshake, when the page loaded.
        // After a sign-in or Sign-out changes who the player is, reconnect so the
        // handshake resolves the Session again (ADR-0001). Not on the app-load
        // check: the socket's own handshake already saw that Session.
        if (changed && !initial) {
          reconnectSocket();
        }
      }
      return nextUsername;
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(() => runRefresh({ initial: false }), [runRefresh]);

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
    runRefresh({ initial: true }).catch((error) => {
      console.error("Could not ask /api/current-user:", error);
    });
  }, [runRefresh]);

  const value = useMemo(
    () => ({ username, isSignedIn: username !== null, loading, refresh, signOut }),
    [username, loading, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
