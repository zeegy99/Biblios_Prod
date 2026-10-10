import { createContext, useContext } from "react";

// Who the player is, as the server's Session says. Provided by <AuthProvider>.
export const AuthContext = createContext(null);

// Returns { username, isSignedIn, loading, refresh }.
//   username   - the Signed-in Player's account username, or null for a Guest
//   isSignedIn - username !== null
//   loading    - true until the first /api/current-user answer arrives
//   refresh()  - asks /api/current-user again; resolves to the new username (or null).
//                Call it after anything that changes the Session (sign-in, Sign-out).
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return auth;
}
