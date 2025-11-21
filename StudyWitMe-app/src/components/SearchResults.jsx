import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { db } from "../services/firebase";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";

export default function SearchResults() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [deckResults, setDeckResults] = useState([]);
    const [cardResults, setCardResults] = useState([]);
    const [deckTitles, setDeckTitles] = useState({});
    const [profileResults, setProfileResults] = useState([]);
    const [error, setError] = useState("");

    const term = (searchParams.get("q") || "").trim();

    useEffect(() => {
        if (!term) {
            setDeckResults([]);
            setCardResults([]);
            setProfileResults([]);
            return;
        }

        const runSearch = async () => {
            setLoading(true);
            setError("");

            try {
                const decksRef = collection(db, "deck");
                const cardsRef = collection(db, "flashcard");
                const usersRef = collection(db, "users");

                const [deckSnap, cardSnap, userSnap] = await Promise.all([
                    getDocs(query(decksRef, where("isPublic", "==", true))),
                    getDocs(query(cardsRef, where("isPublic", "==", true))),
                    getDocs(usersRef),
                ]);

                const qLower = term.toLowerCase();

                const decks = deckSnap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((d) =>
                        [d.title, d.description]
                            .filter(Boolean)
                            .some((field) => field.toLowerCase().includes(qLower))
                    );

                const cardsRaw = cardSnap.docs
                    .map((c) => ({ id: c.id, ...c.data() }))
                    .filter((c) =>
                        [c.front, c.back]
                            .filter(Boolean)
                            .some((field) => field.toLowerCase().includes(qLower))
                    );

                const cardsByDeck = {};
                for (const card of cardsRaw) {
                    if (!cardsByDeck[card.deckId]) cardsByDeck[card.deckId] = [];
                    cardsByDeck[card.deckId].push(card);
                }

                const deckTitleMap = {};
                const uniqueDeckIds = [...new Set(cardsRaw.map((c) => c.deckId))];
                for (const deckId of uniqueDeckIds) {
                    try {
                        const deckDoc = await getDoc(doc(db, "deck", deckId));
                        if (deckDoc.exists()) {
                            deckTitleMap[deckId] = deckDoc.data().title || "Untitled Deck";
                        } else {
                            deckTitleMap[deckId] = "Unknown Deck";
                        }
                    } catch {
                        deckTitleMap[deckId] = "Unknown Deck";
                    }
                }

                const profiles = userSnap.docs
                    .map((u) => ({ id: u.id, ...u.data() }))
                    .filter((u) =>
                        [u.displayName, u.email]
                            .filter(Boolean)
                            .some((field) => field.toLowerCase().includes(qLower))
                    );

                setDeckTitles(deckTitleMap);
                setDeckResults(decks);
                setCardResults(cardsByDeck);
                setProfileResults(profiles);
            } catch (e) {
                console.error("Search error:", e);
                setError("There was a problem searching. Try again.");
            } finally {
                setLoading(false);
            }
        };

        runSearch();
    }, [term]);

    if (!term) {
        return (
            <div style={{ padding: "2rem" }}>
                <h2>Search</h2>
                <p>Type in the search bar above and hit Enter to see results.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: "2rem" }}>
            <button onClick={() => navigate(-1)}>← Back</button>
            <h2>Results for “{term}”</h2>

            {loading && <p>Searching...</p>}
            {error && <p>{error}</p>}

            {!loading && !error && (
                <>
                    <section style={{ marginTop: "1.5rem" }}>
                        <h3>Profiles</h3>
                        {profileResults.length === 0 ? (
                            <p>No profiles found.</p>
                        ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
                                {profileResults.map((user) => (
                                    <div
                                        key={user.id}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "1rem",
                                            borderRadius: "12px",
                                            padding: "1rem",
                                            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                                            cursor: "pointer",
                                            minWidth: "260px",
                                            backgroundColor: "#ffffff",
                                        }}
                                        onClick={() => navigate(`/profile/${user.id}`)}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <h4>{user.displayName || "Unnamed User"}</h4>
                                            <p style={{ margin: 0, fontSize: "0.9rem" }}>
                                                {user.email}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section style={{ marginTop: "2rem" }}>
                        <h3>Decks</h3>
                        {deckResults.length === 0 ? (
                            <p>No public decks found.</p>
                        ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
                                {deckResults.map((deck) => (
                                    <div
                                        key={deck.id}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "1rem",
                                            borderRadius: "12px",
                                            padding: "1rem",
                                            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                                            cursor: "pointer",
                                            minWidth: "260px",
                                            backgroundColor: "#ffffff",
                                        }}
                                        onClick={() =>
                                            navigate(`/flashcards/deck/${deck.id}/study`)
                                        }
                                    >
                                        {deck.imageUrl && (
                                            <a
                                                href={deck.attributionLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <img
                                                    src={deck.imageUrl}
                                                    alt="Deck"
                                                    style={{
                                                        width: "80px",
                                                        height: "80px",
                                                        objectFit: "cover",
                                                        borderRadius: "8px",
                                                        flexShrink: 0,
                                                    }}
                                                />
                                            </a>
                                        )}
                                        <div style={{ flex: 1 }}>
                                            <h4>{deck.title || "Untitled Deck"}</h4>
                                            <p style={{ margin: 0, fontSize: "0.9rem" }}>
                                                Category: {deck.category || "Uncategorized"}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section style={{ marginTop: "2rem" }}>
                        <h3>Flashcards</h3>
                        {Object.keys(cardResults).length === 0 ? (
                            <p>No public flashcards found.</p>
                        ) : (
                            Object.entries(cardResults).map(([deckId, cards]) => (
                                <div key={deckId} style={{ marginBottom: "1.5rem" }}>
                                    {cards.map((card) => (
                                        <div
                                            key={card.id}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "1rem",
                                                borderRadius: "12px",
                                                padding: "1rem",
                                                boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                                                cursor: "pointer",
                                                backgroundColor: "#ffffff",
                                                marginBottom: "1rem",
                                            }}
                                            onClick={() =>
                                                navigate(`/flashcards/deck/${deckId}/study`)
                                            }
                                        >
                                            {card.imagePath && (
                                                <img
                                                    src={card.imagePath}
                                                    alt="Flashcard"
                                                    style={{
                                                        width: "80px",
                                                        height: "80px",
                                                        objectFit: "cover",
                                                        borderRadius: "8px",
                                                        flexShrink: 0,
                                                    }}
                                                />
                                            )}
                                            <div style={{ flex: 1 }}>
                                                <h4>{deckTitles[deckId] || "Unknown Deck"}</h4>
                                                <p style={{ fontSize: "0.9rem", margin: 0 }}>
                                                    <strong>Front:</strong> {card.front}
                                                </p>
                                                <p style={{ fontSize: "0.9rem", opacity: 0.7 }}>
                                                    <strong>Back:</strong> {card.back}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
