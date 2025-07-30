import React from 'react';
import "./timer.css";
import { useState, useEffect, useRef } from 'react';
import Hikaru from "./sound/Hikaru_Music.wav";
import Fart from "./sound/fart-5-228245.mp3";
import clockTick from "./sound/clock-ticking-365218.mp3";
const Timer = ({duration, onTimeout}) => {

    const [time, setTime] = useState(duration);
    const audio = new Audio(Fart);
    const hasRunRef = useRef(false);
    audio.volume = 0.3;

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
                tick.volume = 0.3;
                tick.play();
            }
            return prev - 1000;
            });
        
        }, 1000);

  return () => clearInterval(intervalId);
}, []);

    const getFormattedTime = (milliseconds) => {
        let total_seconds = parseInt(Math.floor(milliseconds/ 1000))
        let seconds = parseInt(total_seconds % 60);

        return seconds
    };

    return (
        <div className="timer-bar-container">
            <div className="timer-bar" />
            <p> {getFormattedTime(time)}</p>
        </div>
        

        
    )
 
}

export default Timer;