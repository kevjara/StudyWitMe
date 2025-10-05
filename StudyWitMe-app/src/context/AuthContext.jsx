import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const logout = () => signOut(auth);

    return (
        <AuthContext.Provider value={{ currentUser, logout }}>
        {!loading && children}
        </AuthContext.Provider>
    );
    }

    export function useAuth() {
    return useContext(AuthContext);
}