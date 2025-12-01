import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import TimeSelector from "./TimeSelector";
import styles from "./FlashcardsQuiz.module.css";

function FlashcardsQuiz() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const { state } = useLocation();
    const deck = state?.deck;

    // Core data
    const [flashcards, setFlashcards] = useState([]);
    const [filteredFlashcards, setFilteredFlashcards] = useState([]);
    const [processedFlashcards, setProcessedFlashcards] = useState([]); // each item: [question, responseOrOptions, isMC, correctLabel]
    const [currentIndex, setCurrentIndex] = useState(0);
    const [maxShortCards, setMaxShortCards] = useState(0);

    // UI state
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");
    const [selectedOption, setSelectedOption] = useState([]); // array of labels for MC
    const [showResult, setShowResult] = useState(false);
    const [shortResponse, setShortResponse] = useState([]); // array of strings for short answers
    const statusTimeoutRef = useRef(null);
    const [cardStatuses, setCardStatuses] = useState([]);
    const [quizStarted, setQuizStarted] = useState(false);
    const [savedAnswers, setSavedAnswers] = useState([]); // user's saved answers (label or text)
    const [quizStats, setQuizStats] = useState(null); // { correct, incorrect, total, grade, timeSpent }
    // Quiz length toggle
    const [quizLength, setQuizLength] = useState("full"); // "full" or "short"
    const [difficulty, setDifficulty] = useState("normal"); //"easy, normal, hard"

    // Setup & timer (from version 2)
    // Time selection mode
    const [timeMode, setTimeMode] = useState("auto"); // "auto" | "custom"
    const [customHours, setCustomHours] = useState("0");
    const [customMinutes, setCustomMinutes] = useState("6");
    const [customSeconds, setCustomSeconds] = useState("0");
    const [lastWarning, setLastWarning] = useState(null);
    const [showSetup, setShowSetup] = useState(false);
    const [questionCount, setQuestionCount] = useState(0);
    const [selectedTime, setSelectedTime] = useState(15); // minutes
    const [timeLeft, setTimeLeft] = useState(null); // seconds
    const [timerRunning, setTimerRunning] = useState(false);
    const [showTimer, setShowTimer] = useState(false);

    useEffect(() => {
        if (!deck) {
        setStatus("No deck selected. Returning...");
        const timer = setTimeout(() => navigate("/flashcards"), 2000);
        return () => clearTimeout(timer);
        }
    }, [deck, navigate]);

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

    // Keep filteredFlashcards from Version 2 (only cards that have front & back)
    useEffect(() => {
        if (!flashcards.length) {
            setFilteredFlashcards([]);
            setMaxShortCards(0);
            setQuestionCount(0);
            return;
        }

        const filtered = flashcards.filter(
            (fc) => fc.front?.trim() && fc.back?.trim()
        );

        setFilteredFlashcards(filtered);

        const maxShort = Math.ceil(filtered.length / 2);
        setMaxShortCards(maxShort);

        // Update questionCount based on quizLength and filtered cards
        setQuestionCount((prev) => {
            if (quizLength === "short") {
                // If previous count is valid, keep it; else default to maxShort
                return prev > 0 && prev <= maxShort ? prev : maxShort;
            } else {
                return filtered.length;
            }
        });

        if (filtered.length === 0) {
            setStatus("No flashcards with content to quiz.");
        }
    }, [flashcards, quizLength]);


    //Time Mode Custom
    useEffect(() => {
        if (timeMode === "custom") {
            updateCustomTime();
        }
    }, [customHours, customMinutes, customSeconds, timeMode]);

    //Time Mode Auto
    useEffect(() => {
        if (timeMode === "auto") {
            const times = getAvailableTimes();
            const maxTime = Math.max(...times);
            setSelectedTime(maxTime);
        }
    }, [timeMode, questionCount]);

    // Timer effect (from Version 2)
    useEffect(() => {
        if (!timerRunning || timeLeft === null) return;

        // Timer finished
        if (timeLeft <= 0) {
        setTimerRunning(false);
        autoSubmitDueToTimeout();
        return;
        }

        // 5-minute warning (300 seconds)
        if (timeLeft === 300 && lastWarning !== 300) {
        // keep simple alert for now
        alert("⚠️ 5 minutes remaining!");
        setLastWarning(300);
        }

        // 1-minute warning (60 seconds)
        if (timeLeft === 60 && lastWarning !== 60) {
        alert("⏳ 1 minute remaining!");
        setLastWarning(60);
        }

        const interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [timerRunning, timeLeft, lastWarning]);

    function showStatus(message, duration = 4500) {
        if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        }
        setStatus(message);
        statusTimeoutRef.current = setTimeout(() => {
        setStatus("");
        statusTimeoutRef.current = null;
        }, duration);
    }

    // parseMCOptions - from Version 1 (robust)
    const parseMCOptions = (relevantText) => {
        if (!relevantText || typeof relevantText !== "string") return [];

        // 1) Try the strict triple-pipe format first
        try {
        const pipeParts = relevantText.split("|||").map((s) => s.trim());
        if (pipeParts.length > 0 && pipeParts[0] === "") pipeParts.shift();

        if (pipeParts.length >= 2 && /^[A-D]$/i.test(pipeParts[0])) {
            const options = [];
            for (let i = 0; i < pipeParts.length; i += 2) {
            const label = pipeParts[i]?.toUpperCase();
            const text = pipeParts[i + 1]?.trim();
            if (!label || !text) continue;
            options.push({
                label,
                text,
                isCorrect: label === "A", // backend contract: A is correct
            });
            }
            if (options.length) return options;
        }
        } catch (e) {
        // fall through
        }

        // 2) Try labeled-lines format
        try {
        const lineRegex = /(^|\n)\s*([A-D])\s*[\)\.\:]\s*(.+?)(?=(\n\s*[A-D]\s*[\)\.\:])|$)/gis;
        const matches = [];
        let m;
        while ((m = lineRegex.exec(relevantText)) !== null) {
            const label = m[2].toUpperCase();
            const text = m[3].trim();
            if (label && text) matches.push({ label, text, isCorrect: label === "A" });
        }
        if (matches.length) return matches;
        } catch (e) {
        // ignore
        }

        // 3) Inline labels
        try {
        const inlineRegex = /([A-D])\s*[\)\.\:]\s*([^A-D]+)/g;
        const arr = [];
        let mm;
        while ((mm = inlineRegex.exec(relevantText)) !== null) {
            const label = mm[1].toUpperCase();
            const text = mm[2].trim();
            if (label && text) arr.push({ label, text, isCorrect: label === "A" });
        }
        if (arr.length) return arr;
        } catch (e) {}

        // 4) Fallback: split on pipes and pair
        try {
        const tokens = relevantText.split("|").map((s) => s.trim()).filter(Boolean);
        if (tokens.length >= 2 && /^[A-D]$/i.test(tokens[0])) {
            const opts = [];
            for (let i = 0; i < tokens.length; i += 2) {
            const label = tokens[i]?.toUpperCase();
            const text = tokens[i + 1];
            if (!label || !text) continue;
            opts.push({ label, text, isCorrect: label === "A" });
            }
            if (opts.length) return opts;
        }
        } catch (e) {}

        console.warn("parseMCOptions: unable to parse MC options from:", relevantText);
        return [];
    };

    // Setup UI handlers (from Version 2)
    const handleOpenSetup = () => {
        setShowSetup(true);
        setQuestionCount(filteredFlashcards.length); // default max
    };

    const getAvailableTimes = () => {
        const blocks = Math.ceil(Math.max(1, questionCount) / 12);
        const times = [];
        for (let i = 1; i <= blocks; i++) {
        const minutes = i * 15;
        if (minutes <= 120) times.push(minutes);
        }
        // ensure at least one option exists
        if (times.length === 0) times.push(15);
        return times;
    };

    //Set quiz time based on user input from custom time mode
    const updateCustomTime = () => {
        const h = Number(customHours) || 0;
        const m = Number(customMinutes) || 0;
        const s = Number(customSeconds) || 0;

        const totalMinutes = (h * 60) + m + (s / 60);
        if (totalMinutes > 0) {
            setSelectedTime(totalMinutes);
        }
    };

    // handle start quiz: set timer and call startQuiz (but our startQuiz uses /quiz)
    const handleStartQuiz = async () => {
        setLastWarning(null);
        setTimerRunning(false);
        // Start the timer after quiz created (or start it now and keep it running once quiz starts)
        // We'll start countdown when we set timerRunning = true after quiz creation to avoid wasted time during generation
        await startQuiz(); // per decision: startQuiz uses /quiz and ignores questionCount
    };

    // startQuiz uses the /quiz route (Version 1 logic). It ignores questionCount (Option 1).
    const startQuiz = async () => {
        if (filteredFlashcards.length === 0) {
            setStatus("No flashcards found in this deck.");
            return;
        }

        try {
        setStatus("Creating quiz...");
        setQuizStarted(false);

        // Determine which flashcards to send
        let flashcardsToSend = filteredFlashcards;

        if (quizLength === "short") {
            const shuffled = [...filteredFlashcards];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            // Clamp to questionCount to avoid out-of-range
            const maxCards = Math.min(questionCount, shuffled.length);
            flashcardsToSend = shuffled.slice(0, maxCards);
        }

        // Format flashcards for the backend - use front/back fields
        const formatted = flashcardsToSend.map((fc) => ({
            question: fc.front,
            relevantText: fc.back,
            isMultipleChoice: fc.type === "Multiple Choice",
        }));

        const response = await fetch("/quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                flashcards: formatted,
                mode: quizLength === "full" ? "full" : "short",
                difficulty: difficulty,        // ← FIXED HERE
                questionCount: quizLength === "short" ? flashcardsToSend.length : null
            }),
        });


        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Server error");
        }

        const data = await response.json();
        if (!data.output || !Array.isArray(data.output)) {
            throw new Error("Invalid quiz response from server");
        }

        // IMPORTANT: The backend returns fully NEW quiz items. Use them directly.
        // Each output item should be { question, relevantText, isMultipleChoice }
        const outputs = data.output;
        setQuestionCount(outputs.length);
        if (timeMode === "auto") {
            const times = getAvailableTimes();
            setSelectedTime(Math.max(...times));
        }

        const processed = outputs.map((item, idx) => {
            const q = item.question || "";
            const isMC = !!item.isMultipleChoice;
            const relevant = (item.relevantText ?? "").toString();

            if (!isMC) {
            // Short answer: relevant is a plain string (the correct answer)
            return [q, relevant, false, null];
            }

            // Multiple choice: parse options
            const parsedOptions = parseMCOptions(relevant);

            // Fallback to short answer if parsing failed
            if (!parsedOptions || parsedOptions.length === 0) {
            console.warn(
                `Quiz item ${idx} marked MC but parser returned 0 options. Falling back to short-answer. RelevantText:`,
                relevant
            );
            return [q, relevant, false, null];
            }

            // Shuffle parsed options
            const shuffled = [...parsedOptions];
            for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Normalize display labels to A/B/C/D while keeping isCorrect anchored to original label
            const normalized = shuffled.map((o, i) => ({
            label: ["A", "B", "C", "D"][i],
            text: o.text,
            isCorrect: o.isCorrect, // correctness derived from original label (A is correct)
            }));

            // Determine correct label after normalization
            const correctLabel = normalized.find((o) => o.isCorrect)?.label || null;

            return [q, normalized, true, correctLabel];
        });

        // initialize UI state
        setProcessedFlashcards(processed);
        setCardStatuses(processed.map(() => ""));
        setCurrentIndex(0);
        setQuizStarted(true);
        setSelectedOption([]);
        setShortResponse([]);
        setSavedAnswers([]);
        setShowResult(false);
        setQuizStats(null);

        // start timer now that quiz is ready
        if (selectedTime && selectedTime > 0) {
            setTimeLeft(selectedTime * 60);
            setShowTimer(true);
            setTimerRunning(true);
        }
        setStatus("");
        showStatus(`Quiz ready (${processed.length} questions).`);
        setShowSetup(false);
        } catch (err) {
        console.error("Quiz error:", err);
        showStatus(`Error: ${err.message}`);
        }
    };

    const resetQuizState = () => {
        setSelectedOption([]);
        setShortResponse([]);
        setSavedAnswers([]);
        setShowResult(false);
        setQuizStats(null);
        setStatus("");

        setCurrentIndex(0);
        setTimerRunning(false);
        setShowTimer(false);

        // Reset card statuses safely (if quiz existed)
        setCardStatuses([]);

        // Completely exit quiz mode
        setQuizStarted(false);

        // Force Setup Screen to appear
        setShowSetup(true);

        // reset backend-generated flashcards
        setProcessedFlashcards([]);
    };

    const autoSubmitDueToTimeout = async () => {
        setTimerRunning(false); // stop countdown
        setShowTimer(false); // hide timer UI
        setStatus("Time's up! Submitting quiz...");
        saveAll();
        // Ensure savedAnswers updated, then submit
        // Wait a tick to allow saveAll to finish updating state
        setTimeout(() => {
        submitQuiz();
        }, 250);
    };

    const saveAll = () => {
        setSavedAnswers((prev) => {
        const autoSaved = [...(prev || [])];

        processedFlashcards.forEach(([question, response, isMC], i) => {
            // already saved? skip
            if (autoSaved[i] !== undefined) return;

            if (isMC) {
            const selected = selectedOption?.[i];
            if (!selected) return; // matches Save-button behavior
            autoSaved[i] = selected;
            } else {
            const answer = shortResponse[i];
            if (!answer?.trim()) return;
            autoSaved[i] = answer;
            }
        });

        return autoSaved;
        });
    };

    const submitQuiz = async () => {
        if (processedFlashcards.length === 0) return;

        setStatus("Submitting quiz...");

        // Clean up selectedOption and shortResponse so UI shows blanks for unsaved answers
        setSelectedOption((prev) => {
        const cleaned = [...(prev || [])];
        processedFlashcards.forEach(([, , isMC], i) => {
            if (savedAnswers[i] === undefined) {
            if (isMC) cleaned[i] = undefined;
            }
        });
        return cleaned;
        });

        setShortResponse((prev) => {
        const cleaned = [...(prev || [])];
        processedFlashcards.forEach(([, , isMC], i) => {
            if (!isMC && savedAnswers[i] === undefined) {
            cleaned[i] = "";
            }
        });
        return cleaned;
        });

        setTimerRunning(false); // stop countdown
        setShowTimer(false); // hide timer UI
        setShowResult(true);

        try {
        let correctCount = 0;
        const total = processedFlashcards.length;

        const results = await Promise.all(
            processedFlashcards.map(async ([question, response, isMC, correctLabel], index) => {
            const userAnswer = savedAnswers[index];
            if (userAnswer === undefined) return "No answer given";

            if (isMC) {
                const correct = userAnswer === correctLabel;
                if (correct) correctCount++;
                const correctText = response.find((opt) => opt.label === correctLabel)?.text || "N/A";
                return correct ? "✅ Correct!" : `❌ Incorrect — correct answer: ${correctText}`;
            } else {
                // response is expected to be the correct answer string
                const res = await fetch("/compare", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAnswer,
                    correctAnswer: response,
                }),
                });
                const data = await res.json();
                if (data.correct) correctCount++;
                return data.correct ? "✅ Correct!" : `❌ Incorrect — correct answer: ${response}`;
            }
            })
        );

        const incorrectCount = total - correctCount;
        const grade = ((correctCount / total) * 100).toFixed(1);

        setCardStatuses(results);
        setQuizStats({ correct: correctCount, incorrect: incorrectCount, total, grade });
        setStatus("Quiz submitted!");
        } catch (err) {
        console.error(err);
        setStatus("Error submitting quiz.");
        }
    };

    if (loading)
        return (
        <div className={styles.studySection}>
            <p>Loading flashcards...</p>
        </div>
        );
    if (!deck)
        return (
        <div className={styles.studySection}>
            <p>No deck selected.</p>
        </div>
        );

    return (
        <>
        <div className={styles.stickyToolbar}>
            <button className={styles.backButton} onClick={() => navigate("/flashcards")}>
            ← Back
            </button>
        </div>

        <div className={styles.studySection}>
            {showSetup && (
            <div className={styles.setupCard}>
                <h2>Setup Your Quiz</h2>
                {/* Quiz Length Toggle */}
                <div className={styles.labelRow}>
                    <label className={styles.toggleLabel}>Length of Quiz</label>
                    {/* Tooltip */}
                    <div className={styles.toolTip}>
                        <div className={styles.icon}>i
                            <div className={styles.toolTipTextOne}>
                                Full uses the complete deck, Short only uses part of the deck 
                                (Short quiz scores won't overwrite previous quiz score)
                            </div>
                        </div>
                    </div>
                </div>

                <label for="filter" class={styles.switch} aria-label="Toggle Filter">
                    <input 
                        type="checkbox" 
                        id="filter" 
                        checked={quizLength === "short"}
                        onChange={(e) =>
                            setQuizLength(e.target.checked ? "short" : "full")
                        }
                    />
                    <span>Full</span>
                    <span>Short</span>
                </label>
                {/* Question Count */}
                {quizLength === "short" && (
                <>
                    <label className={styles.toggleLabel}>Cards to use (max {maxShortCards})</label>
                    <input
                        type="number"
                        min={1}
                        max={maxShortCards}
                        value={questionCount}
                        onChange={(e) => setQuestionCount(Number(e.target.value))}
                    />
                </>
                )}

                {/* Difficulty Selector */}
                <div className={styles.labelRow}>
                    <label className={styles.toggleLabel}>Difficulty</label>
                    {/* Tooltip */}
                    <div className={styles.toolTipTwo}>
                        <div className={styles.iconTwo}>i
                            <div className={styles.toolTipTextTwo}>
                                Easy: 1-to-1 Quiz of flashcards <br />
                                Normal: Standard Quiz <br />
                                Hard: Comprehensive Quiz on deck content
                            </div>
                        </div>
                    </div>
                </div>

                <select
                    className={styles.selectInput}
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                >
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                </select>

                {/* Time Mode Toggle*/}
                <div className={styles.labelRow}>
                    <label className={styles.toggleLabel}>Time Selection</label>
                </div>
                <label htmlFor="timeToggle" className={styles.switch} aria-label="Time Mode Toggle">
                    <input
                        type="checkbox"
                        id="timeToggle"
                        checked={timeMode === "custom"}
                        onChange={(e) => setTimeMode(e.target.checked ? "custom" : "auto")}
                    />
                    <span>Auto</span>
                    <span>Custom</span>
                </label>
                {timeMode === "custom" && (
                    <div className={styles.timeInputRow}>
                        {/* Hours */}
                        <div className={styles.timeField}>
                            <label>Hours</label>
                            <input
                                type="number"
                                maxLength={2}
                                max={99}
                                value={customHours}
                                onChange={(e) => {
                                    if(e.target.value > 99)
                                    {
                                        setCustomHours(99);
                                        e.target.value = 99;
                                    }
                                    setCustomHours(e.target.value);
                                    updateCustomTime();
                                }}
                            />
                        </div>

                        {/* Minutes */}
                        <div className={styles.timeField}>
                            <label>Minutes</label>
                            <input
                                type="number"
                                maxLength={2}
                                min={6}
                                max={59}
                                value={customMinutes}
                                onChange={(e) => {
                                    if(e.target.value > 59)
                                    {
                                        setCustomMinutes(59);
                                        e.target.value = 59;
                                    }
                                    if(e.target.value < 6)
                                    {
                                        setCustomMinutes(6);
                                        e.target.value = 6;
                                    }
                                    setCustomMinutes(e.target.value);
                                    updateCustomTime();
                                }}
                            />
                        </div>

                        {/* Seconds */}
                        <div className={styles.timeField}>
                            <label>Seconds</label>
                            <input
                                type="number"
                                maxLength={2}
                                max={59}
                                value={customSeconds}
                                onChange={(e) => {
                                    if(e.target.value > 59)
                                    {
                                        setCustomSeconds(59);
                                        e.target.value = 59;
                                    }
                                    setCustomSeconds(e.target.value);
                                    updateCustomTime();
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Start Quiz */}
                <button className={styles.startQuizButton} onClick={handleStartQuiz}>
                Start Quiz
                </button>

                <p className={styles.status}>{status}</p>
            </div>
            )}

            {!quizStarted && !showSetup && (
            <div className={styles.coverCard}>
                <div className={styles.deckInfo}>
                <h2 className={styles.deckTitle} title={deck.title || "Untitled Deck"}>
                    {deck.title?.length > 50 ? deck.title.slice(0, 50) + "…" : deck.title || "Untitled Deck"}
                </h2>
                <p className={styles.deckCategory}>
                    <strong>Category:</strong> {deck.category || "Uncategorized"}
                </p>
                <div className={styles.deckDescription}>
                    <p className={styles.descLabel}>
                    <strong>Description:</strong>
                    </p>
                    <p className={styles.descText}>{deck.description?.trim() || "No description available."}</p>
                </div>
                <p className={styles.deckMeta}>{flashcards.length} cards</p>
                <p className={styles.deckMeta}>
                    Created:{" "}
                    {deck.createdAt
                    ? new Date(deck.createdAt.seconds ? deck.createdAt.seconds * 1000 : deck.createdAt).toLocaleString()
                    : "Unknown"}
                </p>
                </div>

                {deck.imagePath && (
                <div className={styles.deckCoverImage}>
                    <img src={deck.imagePath} alt="Deck cover" />
                </div>
                )}

                <div className={styles.buttonRow}>
                <button className={styles.studyButton} onClick={handleOpenSetup}>
                    Create Quiz
                </button>
                </div>

                <p className={styles.status}>{status}</p>
            </div>
            )}

            {quizStarted && processedFlashcards.length > 0 && (
            <div className={styles.quizContainer}>
                {/* Timer (bottom right) */}
                {timerRunning && timeLeft !== null && (
                <div className={styles.timerBox}>
                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                </div>
                )}

                {/* Sidebar */}
                {!showResult && (
                <aside className={styles.sidebar}>
                    <h3 className={styles.sidebarTitle}>Questions</h3>
                    <div className={styles.questionGrid}>
                    {processedFlashcards.map((_, i) => (
                        <div
                        key={i}
                        className={`${styles.questionBox} ${savedAnswers[i] !== undefined ? styles.saved : styles.unsaved}`}
                            onClick={() => {
                                const container = document.getElementById("quiz-scroll-container");
                                const el = document.getElementById(`question-${i}`);

                                if (container && el) {
                                    container.scrollTo({
                                        top: el.offsetTop - 10, // small padding
                                        behavior: "smooth"
                                    });
                                }

                                setCurrentIndex(i);
                            }}
                        >
                        {i + 1}
                        {savedAnswers[i] !== undefined && <span className={styles.checkmark}>✓</span>}
                        </div>
                    ))}
                    </div>
                    <button type="button" className={styles.submitButton} onClick={saveAll}>
                    Save all
                    </button>
                </aside>
                )}

                {showResult && quizStats && (
                <div className={styles.resultsSummary}>
                    <h2>Results Summary</h2>
                    <p>Total Questions: {quizStats.total}</p>
                    <p>Correct: ✅ {quizStats.correct}</p>
                    <p>Incorrect: ❌ {quizStats.incorrect}</p>
                    <h3>Grade: {quizStats.grade}%</h3>
                    <button className={styles.retryButton} onClick={resetQuizState}>
                    Create New Quiz
                    </button>
                </div>
                )}

                <div className={styles.quizContent} id="quiz-scroll-container">
                {/* Quiz Form */}
                <form
                    className={styles.studyBox}
                    onSubmit={(e) => e.preventDefault()}
                >
                    {processedFlashcards.map(([question, response, isMC, correctLabel], index) => (
                    <div key={index} id={`question-${index}`} className={styles.questionBlock}>
                        <h3 className={styles.questionHeader}>Question {index + 1}</h3>
                        <p className={styles.questionText}>{question}</p>

                        {isMC ? (
                        <div className={styles.optionGroup}>
                            {Array.isArray(response) && response.length > 0 ? (
                            response.map(({ label, text }) => (
                                <label key={label} className={styles.optionLabel}>
                                <input
                                    type="radio"
                                    name={`q${index}`}
                                    value={label}
                                    disabled={showResult}
                                    checked={selectedOption?.[index] === label}
                                    onChange={() => {
                                    setSelectedOption((prev) => {
                                        const copy = [...(prev || [])];
                                        copy[index] = label;
                                        return copy;
                                    });
                                    // clear saved answer for this index if different now
                                    setSavedAnswers((prev) => {
                                        const copy = [...(prev || [])];
                                        if (copy[index] !== undefined && copy[index] !== label) {
                                        copy[index] = undefined;
                                        }
                                        return copy;
                                    });
                                    }}
                                />
                                <span>
                                    <strong>{label})</strong> {text}
                                </span>
                                </label>
                            ))
                            ) : (
                            <p className={styles.quizStatus}>No options available for this question.</p>
                            )}
                        </div>
                        ) : (
                        <textarea
                            className={styles.shortResponseInput}
                            placeholder="Type your answer..."
                            disabled={showResult}
                            value={shortResponse[index] || ""}
                            onChange={(e) => {
                            setShortResponse((prev) => {
                                const copy = [...(prev || [])];
                                copy[index] = e.target.value;
                                return copy;
                            });
                            // If a saved answer exists and is different from the new value, clear it
                            setSavedAnswers((prev) => {
                                const copy = [...(prev || [])];
                                if (copy[index] !== undefined && String(copy[index]) !== e.target.value) {
                                copy[index] = undefined;
                                }
                                return copy;
                            });
                            }}
                        />
                        )}

                        {/* Save Button */}
                        {!showResult && (
                        <button
                            type="button"
                            className={styles.submitButton}
                            disabled={savedAnswers[index] !== undefined}
                            onClick={() => {
                            if (isMC) {
                                const selected = selectedOption?.[index];
                                if (!selected) {
                                showStatus("Please choose an option before saving this question.", 2500);
                                return;
                                }
                                setSavedAnswers((prev) => {
                                const copy = [...(prev || [])];
                                copy[index] = selected;
                                return copy;
                                });
                            } else {
                                const userAnswer = shortResponse[index];
                                if (!userAnswer?.trim()) {
                                showStatus("Please type an answer before saving this question.", 2500);
                                return;
                                }
                                setSavedAnswers((prev) => {
                                const copy = [...(prev || [])];
                                copy[index] = userAnswer;
                                return copy;
                                });
                            }
                            }}
                        >
                            {savedAnswers[index] !== undefined ? "Saved" : "Save"}
                        </button>
                        )}

                        {cardStatuses[index] && <p className={styles.quizStatus}>{cardStatuses[index]}</p>}

                        <hr className={styles.divider} />
                    </div>
                    ))}

                    {/* Submit Quiz Button */}
                    {!showResult && (
                    <button
                        type="button"
                        className={styles.finalSubmitButton}
                        disabled={savedAnswers.filter((a) => a !== undefined).length === 0}
                        onClick={submitQuiz}
                    >
                        Submit Quiz
                    </button>
                    )}
                </form>
                </div>
            </div>
            )}
        </div>
        </>
    );
}

export default FlashcardsQuiz;