import { useState, useEffect } from 'react';
import { db } from "./firebase"; 
import { collection, onSnapshot } from "firebase/firestore"; 
import './App.css'; 
export default function Flashcards({ user }) {

    const [flashcards, setFlashcards] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    //this will update flashcards in realtime
    //look at this if something is broken
    //this is complex
    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            setFlashcards([]);
            return;
        }
        setIsLoading(true);
        const userId = user.uid; 
        const cardsCollectionRef = collection(db, 'flashcard');
        //listener like from login
        const unsubscribe = onSnapshot(cardsCollectionRef, (snapshot) => {
            const allCardsData = snapshot.docs.map(doc => ({
                id: doc.id, //the id for flashcards is the generated docID from firebase
                ...doc.data()
            }));
            const userCards = allCardsData.filter(card => card.ownerId === userId);
            setFlashcards(userCards);
            setIsLoading(false);
        },(error) => {
            console.error("Error fetching flashcards:", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    if (!user) {
        return (
            <div className="flashcard-page">
                <h2>Oops, you're not signed in</h2>
                <p>Please sign in to view your flashcards</p>
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
    if (flashcards.length == 0) {
        return (
            <div className="flashcard-page">
                <h2>No flashcards yet</h2>
                <p>Looking for cards owned by ID: {user.uid}</p>
            </div>
        )
    }
    return (
        //focus on this when wanting to do profile or display other stuff from db
        <div className="flashcard-page">
            <h2>Flashcards ({flashcards.length})</h2>
            <div className="flashcard-list">
                {flashcards.map((card) => (
                    <div key={card.id} className="flashcard">
                        <h3>Card ID: {card.id}</h3>
                        <p><strong>Front:</strong> {card.front}</p>
                        <p><strong>Back:</strong> {card.back}</p>
                        <img src={card.imagePath} className="flashcard-image"></img>
                        <p>Owner ID: {card.ownerId}</p>
                        {card.category && <p>Category: {card.category}</p>}
                        {card.isPublic !== undefined && <p>Is Public: {card.isPublic ? 'Yes' : 'No'}</p>}
                    </div>
                ))}
            </div>
        </div>
    )
}
