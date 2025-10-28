import { useMusic } from "../context/MusicProvider";
import { useState, useEffect, useCallback } from "react";
import styles from "./TrackSelector.module.css";
import disc from "../assets/disc.svg";

export default function TrackSelector() {
    const {
        songs,
        currentSongIndex,
        changeSong,
        isPlaying,
        playMusic,
        stopMusic,
    } = useMusic();

    // local selector index — separate from the actual currentSongIndex used for playback
    const [index, setIndex] = useState(currentSongIndex);

    // keep selector synced if external code changes the current playing song
    useEffect(() => {
        setIndex(currentSongIndex);
    }, [currentSongIndex]);

    // scroll up visual (does not change actual playing track)
    const scrollUp = useCallback(() => {
        // always allow cycling, even when songs.length === 1
        const newIndex = (index - 1 + songs.length) % songs.length;
        setIndex(newIndex);
    }, [index, songs.length]);

    // scroll down visual (does not change actual playing track)
    const scrollDown = useCallback(() => {
        const newIndex = (index + 1) % songs.length;
        setIndex(newIndex);
    }, [index, songs.length]);

    const handleWheel = (e) => {
        // prevent accidental large jumps
        if (e.deltaY < 0) scrollUp();
        else if (e.deltaY > 0) scrollDown();
    };


    const current = songs[index];
    const prev = songs[(index - 1 + songs.length) % songs.length];
    const next = songs[(index + 1) % songs.length];

    // Play button behavior:
    // - if selector points at currently playing song AND it is playing => Stop Track
    // - otherwise => change to selected track (if needed) and start playback
    const togglePlay = () => {
        if (currentSongIndex === index) {
            if (isPlaying) {
                stopMusic();
            } else {
                playMusic();
            }
        } else {
            // Change song and autoplay immediately (atomic)
            changeSong(index, true);
        }
    };


    // Button label: show "Stop Track" when selector points to currently playing track and it is playing
    const playLabel = currentSongIndex === index && isPlaying ? "Stop Track" : "Play Track";

    return (
        <div className={styles.trackSelectorContainer}>
        <button className={styles.playButton} onClick={togglePlay}>
            {playLabel}
        </button>

        <div
            className={styles.trackWheel}
            onWheel={handleWheel}
            tabIndex={0}
            role="listbox"
            aria-label="Track selector"
        >
            <div className={`${styles.trackItem} ${styles.prev}`} aria-hidden="true">
            <img src={disc} alt="" />
            <span>{prev?.title}</span>
            </div>

            <div className={`${styles.trackItem} ${styles.current}`} aria-current={true}>
            <img src={disc} alt="" />
            <span>{current?.title}</span>
            </div>

            <div className={`${styles.trackItem} ${styles.next}`} aria-hidden="true">
            <img src={disc} alt="" />
            <span>{next?.title}</span>
            </div>
        </div>
        </div>
    );
}
