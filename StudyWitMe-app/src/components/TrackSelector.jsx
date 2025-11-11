import { useMusic } from "../context/MusicProvider";
import { useState, useEffect, useCallback, useRef  } from "react";
import styles from "./TrackSelector.module.css";
import disc from "../assets/disc.svg";

export default function TrackSelector() {
    const {
        songs,
        currentSongIndex,
        changeSong,
        isPlaying,
        playMusic,
    } = useMusic();

    // local selector index — separate from the actual currentSongIndex used for playback
    const [index, setIndex] = useState(currentSongIndex);
    const wheelRef = useRef(null);

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

    const handleWheel = useCallback(
        (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.deltaY < 0) scrollUp();
            else if (e.deltaY > 0) scrollDown();
        },
        [scrollUp, scrollDown]
    );

    // ✅ Attach non-passive listener to block page scroll
    useEffect(() => {
        const el = wheelRef.current;
        if (!el) return;
        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => el.removeEventListener("wheel", handleWheel);
    }, [handleWheel]);


    const current = songs[index];
    const prev = songs[(index - 1 + songs.length) % songs.length];
    const next = songs[(index + 1) % songs.length];

    // Play button behavior:
    // - if selector points at currently playing song AND it is playing => show Currently Playing
    // - otherwise => change to selected track (if needed) and start playback
    const togglePlay = () => {
        if (currentSongIndex === index) {
            if (isPlaying) {
            } else {
                playMusic();
            }
        } else {
            // Change song and autoplay immediately (atomic)
            changeSong(index, true);
        }
    };


    // Button label: show "Currently Playing" when selector points to currently playing track and it is playing
    const playLabel = currentSongIndex === index && isPlaying ? "Currently Playing" : "Switch Track";

    return (
        <div className={styles.trackSelectorContainer}>
            <button className={styles.playButton} onClick={togglePlay}>
                {playLabel}
            </button>

            <div
                ref={wheelRef}
                className={styles.trackWheel}
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
