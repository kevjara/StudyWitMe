import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import logo from "../assets/Logo.png";
import "./MainMenu.css";


function MainMenu() {
    const navigate = useNavigate();
    const [showDropdown, setShowDropdown] = useState(false);
    const [user, setUser] = useState(null);

    useEffect(() => {
        // Listen for Firebase auth state
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            navigate("/"); // back to TitleScreen
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    return (
        <div className="main-menu">
            <header className="menu-header">
                <nav className="nav-buttons">
                    <button onClick={() => navigate("/profile")}>Profile</button>

                    <div className="dropdown">
                        <button onClick={() => setShowDropdown(!showDropdown)}>
                            Flashcards ▾
                        </button>
                        {showDropdown && (
                            <div className="dropdown-menu">
                                <button onClick={() => navigate("/flashcards/create")}>Create</button>
                                <button onClick={() => navigate("/flashcards/view")}>View</button>
                                <button disabled>Manage (Coming Soon)</button>
                                <button disabled>Share (Coming Soon)</button>
                            </div>
                        )}
                    </div>

                    <button onClick={() => navigate("/play")}>Play</button>

                    {/* Conditionally render auth button */}
                    {user ? (
                        <button onClick={handleSignOut}>Sign Out</button>
                    ) : (
                        <button onClick={() => navigate("/login")}>Sign In</button>
                    )}
                </nav>
                <img src={logo} alt="Logo" className="logo" />
            </header>

            <div className="menu-body">
                <h2>Welcome to StudyWitMe!</h2>
                {user ? (
                    <p>You are signed in as {user.email}</p>
                ) : (
                    <p>You are browsing as a guest.</p>
                )}
            </div>
        </div>
    );
}

export default MainMenu;