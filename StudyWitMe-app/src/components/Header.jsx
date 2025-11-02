import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../services/firebase";
import { onAuthStateChanged } from "firebase/auth";
import settingsIcon from "../assets/settings.svg";
import logo from "../assets/Logo.png";
import home from "../assets/home.svg";
import TrackSelector from "./TrackSelector";
import { useAuth } from "../context/AuthContext";
import { useMusic } from "../context/MusicProvider";
import styles from "./Header.module.css";

function Header({ handleSignOut }) {
    const [hasHoveredSettings, setHasHoveredSettings] = useState(false);
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { hasStartedOnce, playMusic } = useMusic();

    useEffect(() => {
        if (!hasStartedOnce) {
            playMusic();
        }
    }, [hasStartedOnce, playMusic]);

    useEffect(() => {
        // Listen for Firebase auth state
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);


    return (
        <header className={styles.header}>
            <nav className={styles.nav}>
                <img
                src={home}
                alt="Home"
                className={styles.home}
                onClick={() => navigate("/main")}
                title="Home"
                />
                <button onClick={() => navigate("/profile")}>Profile</button>
                <button onClick={() => navigate("/flashcards")}>Flashcards</button>
                <button onClick={() => navigate("/create")}>Create</button>
                <button onClick={() => navigate("/play")}>Play</button>
                {currentUser ? (
                <button onClick={handleSignOut}>Sign Out</button>
                ) : (
                <button onClick={() => navigate("/login")}>Sign In</button>
                )}
                <img
                src={settingsIcon}
                alt="Settings"
                className={`${styles.settingsIcon} ${
                    !hasHoveredSettings ? styles.shakeOnce : ""
                }`}
                onMouseEnter={() => setHasHoveredSettings(true)}
                onClick={() => navigate("/settings")}
                title="Settings"
                />
            </nav>

            <div className={styles.music}>
                <TrackSelector />
            </div>

            <img src={logo} alt="Logo" className={styles.logo} />
        </header>
    );
}

export default Header;
