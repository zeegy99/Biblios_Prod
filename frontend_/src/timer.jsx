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