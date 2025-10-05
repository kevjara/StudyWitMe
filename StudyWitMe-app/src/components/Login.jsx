import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../services/firebase"; // adjust path if needed
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import "./Login.css";

export default function Login() {
    const navigate = useNavigate();
    const [mode, setMode] = useState("login"); // "login" or "signup"
    const [loading, setLoading] = useState(false);
    // just use signin instead of signup firebase functions
    const handleSubmit = async (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        //we'll put the firebase complicated stuff here
        const email = data.get("email");
        const password = data.get("password");
        const username = data.get("username");

        setLoading(true);
        try {
        if (mode === "login") {
            // LOGIN
            const userCreds = await signInWithEmailAndPassword(auth, email, password);
            console.log("Logged in:", userCreds.user.uid);
            alert("Login Successful!");
        } else {
            // SIGNUP
            const newUser = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", newUser.user.uid), {
            email,
            displayName: username || null,
            createdAt: serverTimestamp(),
            });
            console.log("Signed up:", newUser.user.uid);
            alert("Signup Successful!");
        }
        e.target.reset();
        navigate("/main"); // go to MainMenu after login/signup
        } catch (error) {
        console.error("Error:", error);
        alert(`Error during ${mode === "login" ? "login" : "signup"}`);
        } finally {
        setLoading(false);
        }
    };

    return (
        <div className="login-screen">
        <div className="login-box">
            <button className="back-btn" onClick={() => navigate("/")}>
            ← Back
            </button>

            <h2>{mode === "login" ? "Sign In" : "Sign Up"}</h2>

            <form onSubmit={handleSubmit} className="login-form">
            {mode === "signup" && (
                <label>
                Username:
                <input type="text" name="username" placeholder="Username" required />
                </label>
            )}

            <label>
                Email:
                <input type="email" name="email" placeholder="Email" required />
            </label>

            <label>
                Password:
                <input type="password" name="password" placeholder="Password" required />
            </label>

            <button type="submit" className="btn" disabled={loading}>
                {loading ? "Processing..." : mode === "login" ? "Login" : "Sign Up"}
            </button>
            </form>

            <p className="toggle-note">
            {mode === "login" ? (
                <>
                Don't have an account?{" "}
                <span className="toggle-link" onClick={() => setMode("signup")}>
                    Sign Up
                </span>
                </>
            ) : (
                <>
                Already have an account?{" "}
                <span className="toggle-link" onClick={() => setMode("login")}>
                    Login
                </span>
                </>
            )}
            </p>
        </div>
        </div>
    );
}