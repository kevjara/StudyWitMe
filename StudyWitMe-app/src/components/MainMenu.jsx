import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/Logo.png";
import "./MainMenu.css";

function MainMenu() {
    const navigate = useNavigate();
    const [showDropdown, setShowDropdown] = useState(false);

    return (
        <div className="main-menu">


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
        </div>
    );
}

export default MainMenu;