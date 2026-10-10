import { createContext, useContext } from "react";

// Who the player is, as the server's Session says. Provided by <AuthProvider>.
export const AuthContext = createContext(null);

// Returns { username, isSignedIn, loading, refresh }.
//   username   - the Signed-in Player's account username, or null for a Guest.
//                It only changes when the server's answer changes, so it is the
//                signal to watch for "who the player is" changing.
//   isSignedIn - username !== null
//   loading    - true until the first /api/current-user attempt finishes
//   refresh()  - asks /api/current-user again. Call it after anything that changes
//                the Session (sign-in, Sign-out). Resolves to the new username, or
//                null when the server answers 401 (Guest). Rejects on a network
//                error or any other non-OK answer, leaving username unchanged.
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return auth;
}
