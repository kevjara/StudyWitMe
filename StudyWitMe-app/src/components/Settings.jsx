import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMusic } from "../context/MusicProvider";
import styles from "./Settings.module.css";

function Settings() {
    const navigate = useNavigate();
    const {
        isPlaying,
        playMusic,
        stopMusic,
        volume,
        increaseVolume,
        decreaseVolume,
    } = useMusic();

    const [page, setPage] = useState("main"); // "main" or "music"

    const handleBack = () => {
        if (page === "music") setPage("main");
        else if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate("/main");
        }
    };

    return (
        <div className={styles.settingsContainer}>
        <div className={styles.settingsCard}>
            <button className={styles.backButton} onClick={handleBack}>
            ← Back
            </button>

            {page === "main" && (
            <>
                <h1 className={styles.title}>Settings</h1>
                <div className={styles.buttonGroup}>
                <button
                    className={styles.optionButton}
                    onClick={() => setPage("music")}
                >
                    Music
                </button>
                <button className={styles.optionButton}>About</button>
                <button className={styles.optionButton}>Credits</button>
                </div>
            </>
            )}

            {page === "music" && (
            <>
                <h1 className={styles.title}>Music Settings</h1>

                <div className={styles.musicOption}>
                <span className={styles.label}>Music:</span>
                <div className={styles.inlineButtons}>
                    <button
                    className={`${styles.toggleButton} ${
                        isPlaying ? styles.active : ""
                    }`}
                    onClick={playMusic}
                    >
                    On
                    </button>
                    <button
                    className={`${styles.toggleButton} ${
                        !isPlaying ? styles.active : ""
                    }`}
                    onClick={stopMusic}
                    >
                    Off
                    </button>
                </div>
                </div>

                <div className={styles.musicOption}>
                <span className={styles.label}>Volume:</span>
                <div className={styles.volumeControl}>
                    <button
                    className={styles.volumeButton}
                    onClick={decreaseVolume}
                    >
                    −
                    </button>
                    <div className={styles.progressBar}>
                    <div
                        className={styles.progressFill}
                        style={{ width: `${volume * 100}%` }}
                    ></div>
                    </div>
                    <button className={styles.volumeButton} onClick={increaseVolume}>
                    +
                    </button>
                </div>
                <p className={styles.volumeText}>{Math.round(volume * 100)}%</p>
                </div>
            </>
            )}
        </div>
        </div>
    );
}

export default Settings;
