import React from 'react';
import "./timer.css";
import { useState, useEffect, useRef } from 'react';
import Hikaru from "./sound/Hikaru_Music.wav";
import Fart from "./sound/fart-5-228245.mp3";
import clockTick from "./sound/clock-ticking-365218.mp3";
import Boom from "./sound/vine-boom-162668.mp3";
const Timer = ({duration, onTimeout, small_duration = false}) => {

    const [time, setTime] = useState(duration);
    const rand = Math.random() < 0.5;
    const audio = new Audio(rand ? Fart : Boom);
    const hasRunRef = useRef(false);
    const tickingRef = useRef(null);
    audio.volume = (localStorage.getItem("Volume") / 100);
    // console.log("small_duration", small_duration)

    useEffect(() => {
        

        const intervalId = setInterval(() => {
            setTime(prev => {
            if (prev <= 1000) {
                audio.play()
                clearInterval(intervalId);
                onTimeout?.();
                return 0;
            }

            if (prev <= 6000 && !hasRunRef.current) {
                hasRunRef.current = true; 
                const tick = new Audio(clockTick);
                tick.volume = (localStorage.getItem("Volume") / 100);
                tick.play();
                tickingRef.current = tick;
            }
            return prev - 1000;
            });
        
        }, 1000);

  return () => {
    clearInterval(intervalId);
    if (tickingRef.current) {
    tickingRef.current.pause();
    tickingRef.current.currentTime = 0;
    tickingRef.current = null;
  }
  }
}, []);

    const getFormattedTime = (milliseconds) => {
        let total_seconds = parseInt(Math.floor(milliseconds/ 1000))
        let seconds = parseInt(total_seconds % 60);

        return seconds
    };

    return (
        <>
           <div className="timer-bar-container">
            <div
                className={small_duration ? "timer-bar_10" : "timer-bar"}
                style={{
                width: `${(time / duration) * 100}%`,
                }}
            />
            <p>{getFormattedTime(time)}</p>
            </div>


        
        
        </>
        
        

        
    )
 
}

export default Timer;

// The turn timer of a server-rules Game: it only counts down to the
// server's deadline (ms since the epoch, from the Player View) and does
// nothing when it reaches zero, because the server plays the default Move.
// Remaining time is deadline - Date.now(), so a client clock that is off
// shows the time off by as much; the server's clock is the one that counts.
export const DeadlineTimer = ({ deadline }) => {
    const [now, setNow] = useState(() => Date.now());
    // The full length of this deadline, as first seen, sizes the bar.
    const totalRef = useRef({ deadline: null, total: 1 });
    if (totalRef.current.deadline !== deadline) {
        totalRef.current = { deadline, total: Math.max(1, deadline - Date.now()) };
    }

    useEffect(() => {
        const intervalId = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(intervalId);
    }, [deadline]);

    if (typeof deadline !== "number") return null;
    const left = Math.max(0, deadline - now);
    const fraction = Math.min(1, left / totalRef.current.total);
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
