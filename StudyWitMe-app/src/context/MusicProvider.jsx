import { createContext, useContext, useEffect, useRef, useState } from "react";

const MusicContext = createContext();
export function useMusic() {
    return useContext(MusicContext);
}

export function MusicProvider({ children }) {
    const songs = [
        { title: "Bossa Nova", file: "Music/bossa-nova-14396.mp3" }, 
        { title: "Jazz Lounge", file: "Music/jazz-lounge-relaxing-background-music-412597.mp3"},
        { title: "Whispers", file: "Music/whispers-in-the-smoke-2-424935.mp3"},
        { title: "Closer", file: "Music/closer-236250.mp3"},
        { title: "Warm Lifestyle", file: "Music/soft-nostalgic-warm-lifestyle-elegance-lofi-music-190599.mp3"},
        { title: "Lying in the Grass", file: "Music/lying-in-the-grass-virtuexii-220283.mp3"},
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
        // If no audio instance, create one for the currentSongIndex
        if (!audioRef.current) {
            const song = songs[currentSongIndex];
            const audio = new Audio(song.file);
            audio.loop = false;
            audio.volume = volume;
            audioRef.current = audio;

            audio.addEventListener("ended", () => {
            fadeOutAndStop(500).then(() => {
                audio.currentTime = 0;
                audio.play().catch((err) => console.log("Autoplay blocked:", err));
                fadeInAudio(audio, 1000);
            });
            });
        }

        const audio = audioRef.current;
        audio.play().catch((err) => console.log("Autoplay blocked:", err));
        setIsPlaying(true);
        setHasStartedOnce(true);
        fadeInAudio(audio, 1000);
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

    // MusicProvider.jsx — replace existing changeSong implementation with this
    const changeSong = (index, autoplay = false) => {
        if (index < 0 || index >= songs.length) return;

        // update provider state immediately
        setCurrentSongIndex(index);

        // If there is currently an audio instance, stop and drop it
        if (audioRef.current) {
            try { audioRef.current.pause(); } catch (e) {}
            audioRef.current = null;
        }

        // If caller asked to autoplay, create an audio instance for the new index and start it.
        if (autoplay) {
            const song = songs[index];
            const audio = new Audio(song.file);
            audio.loop = false;
            audio.volume = volume; // use provider volume state
            audioRef.current = audio;

            // Reuse the ended handler logic (manual looping + fade behavior)
            audio.addEventListener("ended", () => {
            fadeOutAndStop(500).then(() => {
                // Restart with fade-in
                audio.currentTime = 0;
                audio.play().catch((err) => console.log("Autoplay blocked:", err));
                fadeInAudio(audio, 1000);
            });
            });

            audio.play().catch((err) => console.log("Autoplay blocked:", err));
            setIsPlaying(true);
            setHasStartedOnce(true);
            fadeInAudio(audio, 1000);
        } else {
            // Not autoplaying — keep isPlaying false (caller may call playMusic later)
            setIsPlaying(false);
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