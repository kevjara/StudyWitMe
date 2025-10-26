import { createContext, useContext, useEffect, useRef, useState } from "react";

const MusicContext = createContext();
export function useMusic() {
    return useContext(MusicContext);
}

export function MusicProvider({ children }) {
    const songs = [
        { title: "Main Theme", file: "Music/bossa-nova-14396.mp3" },
    ];

    const [currentSongIndex, setCurrentSongIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [hasStartedOnce, setHasStartedOnce] = useState(false);
    const [loop, setLoop] = useState(true);
    const [volume, setVolume] = useState(0.4); //music volume

    const audioRef = useRef(null);

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const playMusic = () => {
        if (!audioRef.current) {
            const song = songs[currentSongIndex];
            const audio = new Audio(song.file);
            audio.loop = false; // disable native loop, we’ll handle it manually
            audio.volume = 0.4;
            audioRef.current = audio;

            // Handle manual looping with fade-in
            audio.addEventListener("ended", () => {
                fadeOutAndStop(500).then(() => {
                    // Restart with fade-in
                    audio.currentTime = 0;
                    audio.play().catch((err) => console.log("Autoplay blocked:", err));
                    fadeInAudio(audio, 1000); // fade in over 1 second
                });
            });
        }

        const audio = audioRef.current;
        audio.play().catch((err) => console.log("Autoplay blocked:", err));
        setIsPlaying(true);
        setHasStartedOnce(true);
        fadeInAudio(audio, 1000); // initial fade-in when starting
    };

    const fadeInAudio = (audio, duration = 1000) => {
        const targetVolume = 0.4;
        audio.volume = 0;
        const steps = 20;
        const stepTime = duration / steps;
        let currentStep = 0;

        const fade = setInterval(() => {
            currentStep++;
            audio.volume = Math.min(targetVolume * (currentStep / steps), targetVolume);
            if (currentStep >= steps) {
                clearInterval(fade);
                audio.volume = targetVolume;
            }
        }, stepTime);
    };



    const stopMusic = () => {
        if (!audioRef.current) return;
        audioRef.current.pause();
        setIsPlaying(false);
    };

    const restartMusic = () => {
        if (!audioRef.current) return;
        audioRef.current.currentTime = 0;
        audioRef.current.play();
        setIsPlaying(true);
    };

    const changeSong = (index) => {
        if (index < 0 || index >= songs.length) return;
        setCurrentSongIndex(index);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null; // will be recreated by useEffect
        }
    };

    const fadeOutAndStop = (duration = 2000) => {
        return new Promise((resolve) => {
            const audio = audioRef.current;
            if (!audio) return resolve();

            const startVolume = audio.volume;
            const steps = 20;
            const stepTime = duration / steps;
            let currentStep = 0;

            const fade = setInterval(() => {
                currentStep++;
                const newVolume = startVolume * (1 - currentStep / steps);
                audio.volume = Math.max(newVolume, 0);

                if (currentStep >= steps) {
                    clearInterval(fade);
                    audio.pause();
                    audio.currentTime = 0;
                    setIsPlaying(false);
                    resolve(); // ✅ resolve after fade
                }
            }, stepTime);
        });
    };

    const resetMusicState = () => {
        setHasStartedOnce(false);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
            setIsPlaying(false);
        }
    };

    const increaseVolume = () => {
        setVolume((prev) => {
            const newVol = Math.min(prev + 0.05, 1);
            if (audioRef.current) audioRef.current.volume = newVol;
            return newVol;
        });
    };

    const decreaseVolume = () => {
        setVolume((prev) => {
            const newVol = Math.max(prev - 0.05, 0);
            if (audioRef.current) audioRef.current.volume = newVol;
            return newVol;
        });
    };

    return (
        <MusicContext.Provider
            value={{
                songs,
                currentSongIndex,
                currentSong: songs[currentSongIndex],
                isPlaying,
                hasStartedOnce,
                loop,
                playMusic,
                stopMusic,
                restartMusic,
                setLoop,
                changeSong,
                fadeOutAndStop,
                resetMusicState,
                volume,
                increaseVolume,
                decreaseVolume,
            }}
        >
            {children}
        </MusicContext.Provider>
    );
}