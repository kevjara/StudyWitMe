import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import styles from "./FlashcardsStudy.module.css";

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
    const [isFlipped, setIsFlipped] = useState(false);

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
                const q = query(flashRef, where("deckId", "==", deck.id));
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

    // --- Gemini integration (same logic as Quiz) ---
    const startStudying = async () => {
        if (flashcards.length === 0) {
            setStatus("No flashcards found in this deck.");
            return;
        }

        try {
            setStatus("Creating study session...");
            setIsStudying(false);

            // Format flashcards
            const formatted = flashcards.map((fc) => ({
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

            const processed = flashcards.map((fc, idx) => {
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

    if (loading) return <div className={styles.studySection}><p>Loading flashcards...</p></div>;
    if (!deck) return <div className={styles.studySection}><p>No deck selected.</p></div>;

    return (
        <>
            <div className={styles.stickyToolbar}>
                <button className={styles.backButton} onClick={() => navigate("/flashcards")}>
                    ← Back
                </button>
            </div>

            <div className={styles.studySection}>
                <h2 className={styles.deckTitle}>{deck.title || "Untitled Deck"}</h2>

                {!isStudying ? (
                    <div className={styles.coverCard}>
                        <div className={styles.deckInfo}>
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

                        <button className={styles.studyButton} onClick={startStudying}>
                            Start Studying
                        </button>
                        <p className={styles.status}>{status}</p>
                    </div>
                ) : (
                    processedFlashcards.length > 0 && (
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
