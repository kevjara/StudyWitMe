import { useState, useEffect, useRef } from "react";
import {
    WheelPicker,
    WheelPickerWrapper,
} from "@ncdai/react-wheel-picker";
import { useMusic } from "../context/MusicProvider";
import styles from "./TrackSelector.module.css";
import disc from "../assets/disc.svg";

export default function TrackSelector() {
        const { songs, currentSongIndex, changeSong, isPlaying, playMusic } = useMusic();
    const lastSongIndexRef = useRef(currentSongIndex);

    // Build picker options
    const options = songs.map((song) => ({
        label: (
            <div className={styles.trackLabel}>
            <span className={styles.discIcon}></span>
            <span>{song.title}</span>
            </div>
        ),
        value: song.file,
    }));

    const [value, setValue] = useState(options[currentSongIndex]?.value);

    // Sync with external current song index (only when it actually changes)
    useEffect(() => {
        if (currentSongIndex !== lastSongIndexRef.current) {
        setValue(options[currentSongIndex]?.value);
        lastSongIndexRef.current = currentSongIndex;
        }
    }, [currentSongIndex, options]);

    // Scroll = visual only (no autoplay)
    const handleValueChange = (newValue) => {
        setValue(newValue);
    };

    // Determine which track is currently highlighted
    const selectedIndex = options.findIndex((opt) => opt.value === value);

    // Play or switch logic
    const togglePlay = () => {
        if (currentSongIndex === selectedIndex) {
        if (!isPlaying) playMusic();
        } else {
        changeSong(selectedIndex, true); // true = autoplay new track
        }
    };

    const playLabel =
        currentSongIndex === selectedIndex && isPlaying
        ? "Currently Playing"
        : "Switch Track";

    return (
        <div className={styles.trackSelectorContainer}>
        <button className={styles.playButton} onClick={togglePlay}>
            {playLabel}
        </button>

        <div className={styles.trackWheel}>
            <WheelPickerWrapper>
            <WheelPicker
                options={options}
                value={value}
                onValueChange={handleValueChange}
                infinite={true}
                visibleCount={8}
                optionItemHeight={40}
                scrollSensitivity={10}
                classNames={{
                wrapper: styles.trackWheel,
                optionItem: styles.trackItem,
                highlightWrapper: styles.current,
                }}
            />
            </WheelPickerWrapper>
        </div>
        </div>
    );
}
