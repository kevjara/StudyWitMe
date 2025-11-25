import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import styles from "./FlashcardsStudy.module.css";
import { refreshPixabayImage } from "../utils/imageRefresh";

function FlashcardsStudy() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const { state } = useLocation();
    const deck = state?.deck;

    const [flashcards, setFlashcards] = useState([]);
    const [isStudying, setIsStudying] = useState(false);
    const [processedFlashcards, setProcessedFlashcards] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");
    const [selectedOption, setSelectedOption] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [shortResponse, setShortResponse] = useState("");
    const statusTimeoutRef = useRef(null);
    const [cardStatuses, setCardStatuses] = useState([]);
     const [mode, setMode] = useState(null); // null | "practice" | "review"
    const [isFlipped, setIsFlipped] = useState(false);
    const [refreshedUrls, setRefreshedUrls] = useState({});

    // Safety check: no deck
    useEffect(() => {
        if (!deck) {
            setStatus("No deck selected. Returning...");
            const timer = setTimeout(() => navigate("/flashcards"), 2000);
            return () => clearTimeout(timer);
        }
    }, [deck, navigate]);

    // Load flashcards
    useEffect(() => {
        const fetchFlashcards = async () => {
            if (!deck || !currentUser) return;
            try {
                setLoading(true);
                const flashRef = collection(db, "flashcard");
                // Query flashcards - either user owns them OR deck is public
                const isOwner = deck.ownerId === currentUser.uid;
                const q = isOwner || !deck.isPublic
                    ? query(
                        flashRef, 
                        where("deckId", "==", deck.id),
                        where("ownerId", "==", currentUser.uid)
                    )
                    : query(flashRef, where("deckId", "==", deck.id));
                const snap = await getDocs(q);

                const cards = snap.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));

                setFlashcards(cards);
                setLoading(false);
            } catch (err) {
                console.error("Error loading flashcards:", err);
                setStatus("Error loading flashcards.");
                setLoading(false);
            }
        };
        fetchFlashcards();
    }, [deck, currentUser]);

    const resetStudyState = () => {
        setSelectedOption(null);
        setShowResult(false);
        setShortResponse("");
        setCardStatus("");
    };

    //Handle Status Messages
    function showStatus(message, duration = 3000) {
        // Clear any previous timer
        if (statusTimeoutRef.current) {
            clearTimeout(statusTimeoutRef.current);
        }

        setStatus(message);

        statusTimeoutRef.current = setTimeout(() => {
            setStatus("");
            statusTimeoutRef.current = null;
        }, duration);
    }

    // Handle image refresh for expired Pixabay URLs
    const handleImageError = async (e, obj, type) => {
        const isOwner = currentUser?.uid === deck?.ownerId;
        
        if (!obj.pixabayId) {
            console.warn(`⚠️ No pixabayId for ${type} ${obj.id}, cannot refresh`);
            e.target.style.display = 'none';
            return;
        }
        
        const currentStatus = refreshedUrls[obj.id];
        if (currentStatus === 'loading' || currentStatus === 'failed') {
            e.target.style.display = 'none';
            return;
        }
        if (currentStatus && currentStatus !== 'loading' && currentStatus !== 'failed') {
            console.warn(`⚠️ Refreshed URL also expired for ${type} ${obj.id}, giving up`);
            setRefreshedUrls(prev => ({ ...prev, [obj.id]: 'failed' }));
            e.target.style.display = 'none';
            return;
        }

        setRefreshedUrls(prev => ({ ...prev, [obj.id]: 'loading' }));
        e.target.style.opacity = 0.3;
        
        const newUrl = await refreshPixabayImage(type, obj.id, obj.pixabayId, isOwner);

        if (newUrl) {
            console.log(`✅ Fresh URL obtained for ${type} ${obj.id}`);
            setRefreshedUrls(prev => ({ ...prev, [obj.id]: newUrl }));
            e.target.src = newUrl;
            e.target.style.opacity = 1;
            e.target.style.display = 'block';
        } else {
            setRefreshedUrls(prev => ({ ...prev, [obj.id]: 'failed' }));
            e.target.style.display = 'none';
        }
    };

    // --- Gemini integration (same logic as Quiz) ---
    const startStudying = async () => {
        if (flashcards.length === 0) {
            setStatus("No flashcards found in this deck.");
            return;
        }

        try {
            setStatus("Creating study session...");
            setIsStudying(false);

        // Filter out empty-front cards
        const filteredFlashcards = flashcards.filter(fc => fc.front && fc.front.trim() !== "");

        if (filteredFlashcards.length === 0) {
            setStatus("No flashcards with content to study.");
            return;
        }

        // Format flashcards for Gemini
        const formatted = filteredFlashcards.map(fc => ({
            question: fc.front,
            relevantText: fc.back,
            isMultipleChoice: fc.type === "Multiple Choice",
        }));

            const response = await fetch("/study", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ flashcards: formatted }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "Server error");
            }

            const data = await response.json();
            if (!data.output || !Array.isArray(data.output)) {
                throw new Error("Invalid study response from server");
            }

        // Use filteredFlashcards here
        const processed = filteredFlashcards.map((fc, idx) => {
            const raw = data.output[idx] || "";
            if (fc.type !== "Multiple Choice") {
                return [fc.front, raw, false, null];
            }

                const parts = raw
                    .split("|||")
                    .filter((s) => s.trim() && !["A", "B", "C", "D"].includes(s.trim()));

                const options = parts.map((text, i) => ({
                    label: ["A", "B", "C", "D"][i],
                    text: text.trim(),
                    isCorrect: i === 0,
                }));

                for (let i = options.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [options[i], options[j]] = [options[j], options[i]];
                }

                const randomized = options.map((opt, i) => ({
                    label: ["A", "B", "C", "D"][i],
                    text: opt.text,
                    isCorrect: opt.isCorrect,
                }));

                const correctLabel = randomized.find((o) => o.isCorrect)?.label || "A";
                return [fc.front, randomized, true, correctLabel];
            });

            setProcessedFlashcards(processed);
            setCardStatuses(processed.map(() => ""));
            setCurrentIndex(0);
            showStatus(`Study session ready (${processed.length} cards).`);
            setIsStudying(true);
            setMode("practice");
        } catch (err) {
            console.error("Study error:", err);
            showStatus(`Error: ${err.message}`);
        }
    };

    function setCardStatus(message) {
        setCardStatuses((prev) => {
            const newStatuses = [...prev];
            newStatuses[currentIndex] = message; // store status for current card
            return newStatuses;
        });
    }

        // --- Review Mode ---
    const startReview = () => {
            if (flashcards.length === 0) {
                setStatus("No flashcards found in this deck.");
                return;
            }
            setMode("review");
            setCurrentIndex(0);
            setIsFlipped(false);
    };

    if (loading) return <div className={styles.studySection}><p>Loading flashcards...</p></div>;
    if (!deck) return <div className={styles.studySection}><p>No deck selected.</p></div>;

    return (
        <>
            <div className={styles.stickyToolbar}>
                <button
                        className={styles.backButton}
                        onClick={() => {
                            if (mode === "review" || mode === "practice") {
                                setMode(null); // go back to deck cover
                            } else {
                                navigate("/flashcards"); // leave the page
                            }
                        }}
                    >
                        ← Back
                </button>
            </div>

            <div className={styles.studySection}>

                {!mode && (
                    <div className={styles.coverCard}>
                        <div className={styles.deckInfo}>
                            <h2
                                className={styles.deckTitle}
                                title={deck.title || "Untitled Deck"} // <-- tooltip shows full title on hover
                            >
                                {deck.title
                                    ? deck.title.length > 50
                                        ? deck.title.slice(0, 50) + "…"
                                        : deck.title
                                    : "Untitled Deck"}
                            </h2>
                            <p className={styles.deckCategory}>
                                <strong>Category:</strong> {deck.category || "Uncategorized"}
                            </p>
                            <div className={styles.deckDescription}>
                                <p className={styles.descLabel}><strong>Description:</strong></p>
                                <p className={styles.descText}>
                                    {deck.description?.trim() || "No description available."}
                                </p>
                            </div>
                            <p className={styles.deckMeta}>{flashcards.length} cards</p>
                            <p className={styles.deckMeta}>
                            Created:{" "} 
                            {deck.createdAt ? 
                            new Date( deck.createdAt.seconds ? 
                            deck.createdAt.seconds * 1000 : deck.createdAt ).toLocaleString() 
                            : "Unknown"}
                            </p>
                        </div>

                        {deck.imagePath && (
                            <div className={styles.deckCoverImage}>
                                <img 
                                    src={refreshedUrls[deck.id] && refreshedUrls[deck.id] !== 'loading' && refreshedUrls[deck.id] !== 'failed'
                                        ? refreshedUrls[deck.id]
                                        : deck.imagePath}
                                    alt="Deck cover"
                                    style={{
                                        opacity: refreshedUrls[deck.id] === 'loading' ? 0.3 : 1,
                                        transition: 'opacity 0.3s'
                                    }}
                                    onError={(e) => handleImageError(e, deck, 'deck')}
                                />
                            </div>
                        )}

                        <div className={styles.buttonRow}>
                            <button
                                className={styles.reviewButton}
                                onClick={startReview}
                            >
                                Review
                            </button>

                            <button className={styles.studyButton} onClick={startStudying}>
                                Practice
                            </button>
                        </div>
                        <p className={styles.status}>{status}</p>
                    </div>
                )}
                {mode === "review" && flashcards[currentIndex] && (
                    <>
                        <div className={styles.flashcardContainer}>
                            <div
                                className={`${styles.flashcard} ${isFlipped ? styles.flipped : ""}`}
                                onClick={() => setIsFlipped(!isFlipped)}
                            >
                                <div className={styles.front}>
                                    <h3>{flashcards[currentIndex].front}</h3>
                                    {/* Display image if available */}
                                    {flashcards[currentIndex].imagePath && (
                                        <img
                                            src={refreshedUrls[flashcards[currentIndex].id] && refreshedUrls[flashcards[currentIndex].id] !== 'loading' && refreshedUrls[flashcards[currentIndex].id] !== 'failed'
                                                ? refreshedUrls[flashcards[currentIndex].id]
                                                : flashcards[currentIndex].imagePath}
                                            alt="Flashcard visual"
                                            className={styles.flashcardImage}
                                            style={{
                                                opacity: refreshedUrls[flashcards[currentIndex].id] === 'loading' ? 0.3 : 1,
                                                transition: 'opacity 0.3s'
                                            }}
                                            onError={(e) => handleImageError(e, flashcards[currentIndex], 'flashcard')}
                                        />
                                    )}
                                </div>
                                <div className={styles.back}>
                                    <h3>{flashcards[currentIndex].back}</h3>
                                </div>
                            </div>
                        </div>

                        <div className={styles.navButtons}>
                            <button
                                className={styles.navButton}
                                onClick={() => {
                                    setIsFlipped(false);
                                    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
                                }}
                            >
                                &lt;-
                            </button>
                            <button
                                className={styles.navButton}
                                onClick={() => {
                                    setIsFlipped(false);
                                    if (currentIndex < flashcards.length - 1)
                                        setCurrentIndex(currentIndex + 1);
                                }}
                            >
                                -&gt;
                            </button>
                        </div>

                        <p className={styles.status}>
                            Card {currentIndex + 1} of {flashcards.length}
                        </p>
                    </>
                )}
                {mode === "practice" && processedFlashcards.length > 0 && ((
                        <div className={styles.studyBox}>
                            {(() => {
                                const [question, response, isMC, correctLabel] = processedFlashcards[currentIndex] || [];
                                const options = isMC ? response : [];

                                return (
                                    <div>
                                        <p className={styles.quizStatus}>{cardStatuses[currentIndex]}</p>
                                        <h3>{question}</h3>

                                        {isMC ? (
                                            <div>
                                                <div className={styles.optionRow}>
                                                    {options.map(({ label, text }) => (
                                                        <button
                                                            key={label}
                                                            className={`${styles.optionButton} ${
                                                                selectedOption === label ? styles.selectedOption : ""
                                                            } ${
                                                                showResult && label === correctLabel
                                                                    ? styles.correctOption
                                                                    : ""
                                                            } ${
                                                                showResult &&
                                                                selectedOption === label &&
                                                                selectedOption !== correctLabel
                                                                    ? styles.incorrectOption
                                                                    : ""
                                                            }`}
                                                            onClick={() =>
                                                                !showResult && setSelectedOption(label)
                                                            }
                                                        >
                                                            <strong>{label})</strong> {text}
                                                        </button>
                                                    ))}
                                                </div>

                                                <button
                                                    className={styles.submitButton}
                                                    onClick={() => {
                                                        if (!selectedOption) return;
                                                        setShowResult(true);
                                                        if (selectedOption === correctLabel) {
                                                            setCardStatus("✅ Correct!");
                                                        } else {
                                                            const correctText =
                                                                options.find((opt) => opt.label === correctLabel)?.text || "N/A";
                                                            setCardStatus(`❌ Incorrect — correct answer: ${correctText}`);
                                                        }
                                                    }}
                                                >
                                                    Submit
                                                </button>
                                            </div>
                                        ) : (
                                            <div className={styles.shortResponseContainer}>
                                                <textarea
                                                    className={styles.shortResponseInput}
                                                    placeholder="Type your answer..."
                                                    value={shortResponse}
                                                    onChange={(e) => setShortResponse(e.target.value)}
                                                />
                                                <button
                                                    className={styles.submitButton}
                                                    onClick={async () => {
                                                        if (!shortResponse.trim()) return;
                                                        setCardStatus("Checking your answer...");

                                                        try {
                                                            const res = await fetch("/compare", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({
                                                                    userAnswer: shortResponse,
                                                                    correctAnswer: response,
                                                                }),
                                                            });
                                                            const data = await res.json();

                                                            if (data.correct) {
                                                                setCardStatus("✅ Correct!");
                                                            } else {
                                                                setCardStatus(`❌ Incorrect — correct answer: ${response}`);
                                                            }
                                                        } catch (err) {
                                                            console.error("Error comparing answers:", err);
                                                            setCardStatus("Error checking your answer.");
                                                        }
                                                    }}
                                                >
                                                    Submit
                                                </button>
                                            </div>
                                        )}

                                        <div className={styles.navButtons}>
                                            <button
                                                className={styles.navButton}
                                                onClick={() => {
                                                    if (currentIndex > 0) {
                                                        setCurrentIndex(currentIndex - 1);
                                                        resetStudyState();
                                                    }
                                                }}
                                            >
                                                &lt;-
                                            </button>
                                            <button
                                                className={styles.navButton}
                                                onClick={() => {
                                                    if (currentIndex < processedFlashcards.length - 1) {
                                                        setCurrentIndex(currentIndex + 1);
                                                        resetStudyState();
                                                    }
                                                }}
                                            >
                                                -&gt;
                                            </button>
                                        </div>

                                        <p className={styles.cardCount}>
                                            Card {currentIndex + 1} of {processedFlashcards.length}
                                        </p>
                                    </div>
                                );
                            })()}
                        </div>
                    )
                )}
            </div>
        </>
    );
}

export default FlashcardsStudy;