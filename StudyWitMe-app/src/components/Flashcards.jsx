import { useState, useEffect } from 'react';
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { useNavigate, Link } from "react-router-dom";
import "./Flashcards.css";

export default function Flashcards() {
    const { currentUser, loading } = useAuth();
    const [flashcards, setFlashcards] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    //this will update flashcards in realtime
    //look at this if something is broken
    //this is complex
    useEffect(() => {
        if (loading) return;
        if (!currentUser) {
            setIsLoading(false);
            setFlashcards([]);
            return;
        }
        setIsLoading(true);
        const userId = currentUser.uid;
        const q = query(collection(db, 'flashcard'), where('ownerId', '==', userId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const userCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFlashcards(userCards);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching flashcards:", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [loading, currentUser]);

    if (!currentUser) {
        return (
            <div className="flashcard-page">
                <h2>Oops, you're not signed in</h2>
                <p>
                    Please <Link to="/login">sign in</Link> to view your flashcards
                </p>
                <button className="back-button" onClick={() => navigate("/main")}>
                    ← Back
                </button>
            </div>
        )
    }
    if (isLoading) {
        return (
            <div className="flashcard-page">
                <h2>Flashcards are loading...</h2>
            </div>
        )
    }
    // No flashcards yet UI
    if (flashcards.length === 0) {
        return (
            <div className="flashcard-page no-cards">
                <h2>No Flashcards Yet</h2>
                <p>Why not make some?</p>
                <div
                    className="placeholder-card"
                    onClick={() => navigate("/flashcards/create")}
                >
                    <span className="plus-sign">+</span>
                </div>
                <button className="back-button" onClick={() => navigate("/main")}>
                    ← Back
                </button>
            </div>
        );
    }

    // With flashcards
    return (
        //focus on this when wanting to do profile or display other stuff from db
        <div className="flashcard-page">
            <h2>Your Flashcard Sets</h2>
            <div className="flashcard-gallery">
                {flashcards.map((card, index) => (
                    <div
                        key={card.id}
                        className={`flashcard-set ${index < 4 ? `first-row-${flashcards.length}` : ""
                            }`}
                    >
                        <h3>{card.category || "Untitled Set"}</h3>
                        <div className="flashcard-preview">
                            <p><strong>Front:</strong> {card.front}</p>
                            <p><strong>Back:</strong> {card.back}</p>
                            {card.imagePath && (
                                <img
                                    src={card.imagePath}
                                    alt="flashcard preview"
                                    className="flashcard-image"
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <button className="back-button" onClick={() => navigate("/main")}>
                ← Back
            </button>
        </div>
    );
}
