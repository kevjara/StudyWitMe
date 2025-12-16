import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../services/firebase"; // adjust path if needed
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp, getDoc, updateDoc } from "firebase/firestore";
import { handleBack } from "../utils/navigation";
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
                const uid = userCreds.user.uid;
                console.log("Logged in:", userCreds.user.uid);

                //checks for updated user schema
                const userDocRef = doc(db, "users", uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const updates = {};

                    //checksfor 'mastery' field
                    if (!('mastery' in userData)) {
                        updates.mastery = [];
                        console.log("Applying mastery field update.");
                    }

                    //check and update achievements
                    const achievementID = "OhOrf6CEK4BSmhsjdmBo";
                    if (!('achievements' in userData)) {
                        updates.achievements = [achievementID];
                        console.log("Applying achievements field update and granting Beta User achievement.");
                    }
                    //checks for 'userLevel' field
                    if (!('userLevel' in userData)) {
                        updates.userLevel = 0;
                        console.log("Applying userLevel field update (default to 0).");
                    }
                    // check for avatar field
                    if (!('avatar' in userData)) {
                        updates.avatar = "default";
                        console.log("Applying avatar field update (default).");
                    }
                    //if updates are needed, it will save to db
                    if (Object.keys(updates).length > 0) {
                        await updateDoc(userDocRef, updates);
                        console.log(`Schema updated for user ${uid}`);
                    }
                }
                alert("Login Successful!");
            } else {
                // SIGNUP
                const newUser = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", newUser.user.uid), {
                    email,
                    displayName: username || null,
                    avatar: "default",
                    createdAt: serverTimestamp(),
                    mastery: [],
                    achievments: ["OhOrf6CEK4BSmhsjdmBo"],
                    userLevel: 0,
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
                <button className="back-btn" onClick={() => handleBack(navigate, "/")}>
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