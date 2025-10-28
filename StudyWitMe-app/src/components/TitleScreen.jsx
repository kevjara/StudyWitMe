import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMusic } from "../context/MusicProvider";
import logo from "../assets/Logo.png";
import "./TitleScreen.css";

function TitleScreen() {
    const navigate = useNavigate();
    const { stopMusic, resetMusicState } = useMusic();

    useEffect(() => {
        // Stop any music when entering the title screen
        stopMusic();
        resetMusicState(); //ensures MainMenu will restart on next visit
    }, [stopMusic, resetMusicState]);

    return (
        <div className="title-screen">
        {/* Main content */}
        <div className="title-content">
            <img src={logo} alt="Logo" className="title-logo" />

            <div className="welcome-box">
            <h2>Welcome!</h2>

            <button
                className="btn sign-in"
                onClick={() => navigate("/login")}
                title="Sign in will be enabled later"
            >
                Sign In
            </button>

            <button className="btn guest" onClick={() => navigate("/main")}>
                Continue as Guest
            </button>
            </div>
        </div>
        </div>
    );
}

export default TitleScreen;