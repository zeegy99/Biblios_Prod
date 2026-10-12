import React, { useState, useEffect } from "react";
import "./timer.css";

// The turn timer of a server-rules Game: it only counts down to the
// server's deadline (ms since the epoch, from the Player View) and does
// nothing when it reaches zero, because the server plays the default Move.
// The bar is sized by the step's full `duration` (also from the view), so it
// is right however late the view arrived (e.g. after a Rejoin). Remaining
// time is deadline - Date.now(), so a client clock that is off shows the
// time off by as much; the server's clock is the one that counts.
export const DeadlineTimer = ({ deadline, duration }) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const intervalId = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(intervalId);
    }, [deadline]);

    if (typeof deadline !== "number" || typeof duration !== "number") return null;
    const left = Math.max(0, deadline - now);
    const fraction = Math.min(1, left / Math.max(1, duration));
    return (
        <div className="timer-bar-container">
            <div
                className="deadline-bar"
                style={{ width: `${fraction * 100}%`, backgroundColor: left <= 6000 ? "red" : "#4caf50" }}
            />
            <p>{Math.ceil(left / 1000)}</p>
        </div>
    );
};
