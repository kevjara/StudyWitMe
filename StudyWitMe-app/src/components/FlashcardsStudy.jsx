import { useState, useEffect } from "react";
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

    const [isStudying, setIsStudying] = useState(false);
    const [flashcards, setFlashcards] = useState([]);
    const [processedFlashcards, setProcessedFlashcards] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [shortResponse, setShortResponse] = useState("");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(true);

    // --- Safety check: no deck ---
    useEffect(() => {
        if (!deck) {
        setStatus("No deck selected. Returning...");
        const timer = setTimeout(() => navigate("/flashcards"), 2000);
        return () => clearTimeout(timer);
        }
    }, [deck, navigate]);

    // --- Load flashcards for this deck ---
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
            console.error("Error fetching flashcards:", err);
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
    };

    const startStudying = async () => {
        if (flashcards.length === 0) {
        setStatus("No flashcards found in this deck.");
        return;
        }

        try {
        setStatus("Fetching study content from Gemini...");

        // ✅ Convert to backend expected format
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

        // --- Process the Gemini responses ---
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
            isCorrect: i === 0, // "A" always correct
            }));

            // Shuffle
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
        setCurrentIndex(0);
        setStatus(`Study session ready (${processed.length} cards).`);
        setIsStudying(true);
        } catch (err) {
        console.error("Study error:", err);
        setStatus(`Error: ${err.message}`);
        }
    };

    if (loading) return <div className={styles.studySection}><p>Loading flashcards...</p></div>;
    if (!deck) return <div className={styles.studySection}><p>No deck selected.</p></div>;

    return (
        <div className={styles.studySection}>
            <button className={styles.backButton} onClick={() => navigate("/flashcards")}>
                ← "Back"
            </button>
            <h2>{deck.title || "Untitled Deck"}</h2>
            <p className={styles.status}>{status}</p>

            <button className={styles.studyButton} onClick={startStudying}>
                {isStudying ? "Restart Study Session" : "Start Studying"}
            </button>

            {isStudying && processedFlashcards.length > 0 && (
                <div className={styles.studyBox}>
                {(() => {
                    const [question, response, isMC, correctLabel] =
                    processedFlashcards[currentIndex] || [];
                    const options = isMC ? response : [];

                    return (
                    <div>
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
                                setStatus("Checking your answer...");

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
                                    setStatus("✅ Correct!");
                                } else {
                                    setStatus(`❌ Incorrect — correct answer: ${response}`);
                                }
                                } catch (err) {
                                console.error("Error comparing answers:", err);
                                setStatus("Error checking your answer.");
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
                    </div>
                    );
                })()}
            </div>
        )}
        </div>
    );
}

export default FlashcardsStudy;