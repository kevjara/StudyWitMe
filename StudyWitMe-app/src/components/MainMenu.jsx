import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import logo from "../assets/Logo.png";
import { useMusic } from "../context/MusicProvider";
import settingsIcon from "../assets/settings.svg";
import TrackSelector from "./TrackSelector";
import styles from "./MainMenu.module.css";


function MainMenu() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const { hasStartedOnce, playMusic, fadeOutAndStop } = useMusic();
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [hasHoveredSettings, setHasHoveredSettings] = useState(false);

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

    const handleSignOut = async () => {
        setShowSignOutModal(true);

        try {
            await fadeOutAndStop(2000); // wait for fade
            await signOut(auth);
            setShowSignOutModal(false);
            navigate("/"); // go to TitleScreen
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };


    return (
        <div className={styles.mainMenu}>
            <header className={styles.menuHeader}>
                <nav className={styles.navButtons}>
                    <button onClick={() => navigate("/profile")}>Profile</button>
                    <button onClick={() => navigate("/flashcards")}>Flashcards</button>
                    <button onClick={() => navigate("/create")}>Create</button>
                    <button onClick={() => navigate("/play")}>Play</button>

                    {/* Conditionally render auth button */}
                    {user ? (
                        <button onClick={handleSignOut}>Sign Out</button>
                    ) : (
                        <button onClick={() => navigate("/login")}>Sign In</button>
                    )}

                    {/* ⚙️ Settings Icon */}
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

            <div className={styles.menuBody}>
                <h2>Welcome to StudyWitMe!</h2>
                {user ? (
                    <p>You are signed in as {user.email}</p>
                ) : (
                    <p>You are browsing as a guest.</p>
                )}
            </div>
            {/* 🔹 Sign Out Modal Overlay */}
            {showSignOutModal && (
                <div className={styles.signoutOverlay}>
                    <div className={styles.signoutModal}>
                        <h3>Signing out...</h3>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MainMenu;