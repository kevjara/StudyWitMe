import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

export default function AuthGate({ children }) {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Only apply redirect rules on the landing page ("/")
    useEffect(() => {
        if (location.pathname === "/") {
        if (currentUser) {
            navigate("/main", { replace: true });
        } 
        }
    }, [currentUser, location.pathname, navigate]);

    // Case 1: If user is NOT logged in and currently on "/"
    // we allow TitleScreen to show normally.
    if (location.pathname === "/" && !currentUser) {
        return children;
    }

    // Case 2: If user IS logged in and at "/",
    // the redirect will fire above and children won't flash.
    if (location.pathname === "/" && currentUser) {
        return null;
    }

    // Case 3: All other routes always render normally
    return children;
}
