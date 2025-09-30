import { useNavigate } from "react-router-dom";
import logo from "../assets/Logo.png";
import "./TitleScreen.css";

function TitleScreen() {
    const navigate = useNavigate();

    return (
        <div className="title-screen">
        {/* Background pattern container (kept empty — shapes are separate) */}
        <div className="pattern" />

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

        {/* Background Shapes container */}
        <div className="shapes">
            {/* Skinny rectangles */}
            <div className="shape rectangle bottom-left" />
            <div className="shape rectangle bottom-right" />

            {/* Hand-placed circles */}
            <div
            className="shape circle filled"
            style={{ width: "40px", height: "40px", left: "10%", animationDelay: "0s" }}
            />
            <div
            className="shape circle hollow"
            style={{ width: "60px", height: "60px", left: "30%", animationDelay: "2s" }}
            />
            <div
            className="shape circle filled"
            style={{ width: "30px", height: "30px", left: "70%", animationDelay: "4s" }}
            />
            <div
            className="shape circle hollow"
            style={{ width: "50px", height: "50px", left: "85%", animationDelay: "6s" }}
            />

            {/* Randomized circles */}
            {Array.from({ length: 5 }).map((_, i) => {
            const size = Math.floor(Math.random() * 40) + 20;
            const left = Math.random() * 90;
            const delay = `${(Math.random() * 8).toFixed(2)}s`;
            const filled = Math.random() > 0.5;

            return (
                <div
                key={`circle-${i}`}
                className={`shape circle ${filled ? "filled" : "hollow"}`}
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    left: `${left}%`,
                    animationDelay: delay,
                }}
                />
            );
            })}
        </div>
        </div>
    );
}

export default TitleScreen;