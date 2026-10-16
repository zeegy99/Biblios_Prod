import { useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { getCurrentRoom, subscribeToCurrentRoom } from "./socket";

// True while the player is in a Room: the shared socket holds a seat (it has
// joined a Room and not left it or dropped), or the player is on a Room screen
// (the lobby or a game). Sign-in and Sign-out are not offered then, because
// changing Player Identity while holding a seat would orphan the seat.
export function useInRoom() {
  const seatedRoom = useSyncExternalStore(subscribeToCurrentRoom, getCurrentRoom);
  const { pathname } = useLocation();
  const onRoomScreen = pathname === "/lobby" || pathname.startsWith("/game");
  return seatedRoom !== null || onRoomScreen;
}

export const IN_ROOM_MESSAGE = "Leave your Room before signing in or out.";

// Props for a sign-in or Sign-out button: disabled, with IN_ROOM_MESSAGE as its
// tooltip, while the player is in a Room. Spread onto the button:
// <button {...useInRoomGuard()}>.
export function useInRoomGuard() {
  const inRoom = useInRoom();
  return { disabled: inRoom, title: inRoom ? IN_ROOM_MESSAGE : undefined };
}
