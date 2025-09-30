import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/Logo.png";
import "./MainMenu.css";

function MainMenu() {
    const navigate = useNavigate();
    const [showDropdown, setShowDropdown] = useState(false);

    return (
        <div className="main-menu">
        <div className="pattern"></div>

        <header className="menu-header">
        <nav className="nav-buttons">
            <button>Profile</button>

            <div className="dropdown">
                <button onClick={() => setShowDropdown(!showDropdown)}>
                Flashcards ▾
                </button>
                {showDropdown && (
                <div className="dropdown-menu">
                    <button onClick={() => navigate("/flashcards/create")}>Create</button>
                    <button disabled>View (Coming Soon)</button>
                    <button disabled>Manage (Coming Soon)</button>
                    <button disabled>Share (Coming Soon)</button>
                    </div>
                )}
            </div>

            <button>Play</button>
            <button onClick={() => navigate("/")}>Sign Out</button>
            </nav>
            <img src={logo} alt="Logo" className="logo" />
        </header>

        <div className="menu-body">
            <h2>Welcome to StudyWitMe!</h2>
            <p>Select an option from the menu above.</p>
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

export default MainMenu;