import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
    const location = useLocation();

    //search term for nav bar
    const [searchTerm, setSearchTerm] = useState("");

    // when user hits Enter in the search bar
    const handleSearchKeyDown = (e) => {
        if (e.key === "Enter" && searchTerm.trim()) {
            const q = encodeURIComponent(searchTerm.trim());
            navigate(`/search?q=${q}`);
            // optional: clear it
            // setSearchTerm("");
        }
    };

    useEffect(() => {
        if (!hasStartedOnce) {
            playMusic();
        }
    }, [hasStartedOnce, playMusic]);

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
                <button onClick={handleSignOut}>Sign-Out</button>
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
                onClick={() => {
                    if (location.pathname !== "/settings") {
                        navigate("/settings");
                    }
                }}
                title="Settings"
                />

                <input
                    type="text"
                    placeholder="Search public decks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className={styles.navSearchInput}
                />
            </nav>

            <TrackSelector />
            <img src={logo} alt="Logo" className={styles.logo} />
        </header>
    );
}

export default Header;
