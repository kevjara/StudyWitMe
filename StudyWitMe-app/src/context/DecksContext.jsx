import { createContext, useContext, useEffect, useState } from "react";
import { db } from "../services/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "./AuthContext";

const DecksContext = createContext();
export function useDecks() { return useContext(DecksContext); }
export function DecksProvider({ children }) {
  const { currentUser } = useAuth();
  const [decks, setDecks] = useState([]);
  const [deckCounts, setDeckCounts] = useState({});
  const [loadingDecks, setLoadingDecks] = useState(true);
  useEffect(() => {
    if (!currentUser) {
      setDecks([]);
      setDeckCounts({});
      setLoadingDecks(false);
      return;
    }
    const decksRef = collection(db, "deck");
    const q = query(decksRef, where("ownerId", "==", currentUser.uid));
    setLoadingDecks(true);
    const unsubDecks = onSnapshot(q, snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDecks(arr);
      setLoadingDecks(false);
    });

    return () => unsubDecks();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const flashRef = collection(db, "flashcard");
    const q = query(flashRef, where("ownerId", "==", currentUser.uid));

    const unsubCards = onSnapshot(q, snap => {
      const counts = {};
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (!counts[d.deckId]) counts[d.deckId] = 0;
        counts[d.deckId]++;
      });
      setDeckCounts(counts);
    });

    return () => unsubCards();
  }, [currentUser]);

  return (
    <DecksContext.Provider value={{ decks, setDecks, loadingDecks, deckCounts }}>
      {children}
    </DecksContext.Provider>
  );
}
