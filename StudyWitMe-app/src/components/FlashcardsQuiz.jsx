import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import styles from "./FlashcardsQuiz.module.css";

function FlashcardsQuiz() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const deck = state?.deck;

const [flashcards, setFlashcards] = useState([]);
const [filteredFlashcards, setFilteredFlashcards] = useState([]); // from Elvis branch
const [processedFlashcards, setProcessedFlashcards] = useState([]); 
const [currentIndex, setCurrentIndex] = useState(0);
const [loading, setLoading] = useState(true);
const [status, setStatus] = useState("");
const [selectedOption, setSelectedOption] = useState([]); 
const [showResult, setShowResult] = useState(false);
const [shortResponse, setShortResponse] = useState([]); 
const statusTimeoutRef = useRef(null);
const [cardStatuses, setCardStatuses] = useState([]);
const [quizStarted, setQuizStarted] = useState(false);
const [savedAnswers, setSavedAnswers] = useState([]); 
const [quizStats, setQuizStats] = useState(null); // { correct, incorrect, total, grade }
const [lastWarning, setLastWarning] = useState(null);

// NEW quiz-setup logic (keep these!)
const [showSetup, setShowSetup] = useState(false);
const [questionCount, setQuestionCount] = useState(0);
const [selectedTime, setSelectedTime] = useState(15);
const [timeLeft, setTimeLeft] = useState(null);
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


  /**
   * parseMCOptions - robust parser that supports several formats.
   * Returns: [{ label: "A", text: "...", isCorrect: boolean }, ...]
   */
  const parseMCOptions = (relevantText) => {
    if (!relevantText || typeof relevantText !== "string") return [];

    // 1) Strict triple-pipe format: |||A|||Correct|||B|||Wrong...
    try {
      const pipeParts = relevantText.split("|||").map((s) => s.trim());
      if (pipeParts[0] === "") pipeParts.shift();

      if (pipeParts.length >= 2 && /^[A-D]$/i.test(pipeParts[0])) {
        const options = [];
        for (let i = 0; i < pipeParts.length; i += 2) {
          const label = pipeParts[i]?.toUpperCase();
          const text = pipeParts[i + 1]?.trim();
          if (!label || !text) continue;
          options.push({
            label,
            text,
            isCorrect: label === "A",
          });
        }
        if (options.length) return options;
      }
    } catch (_) {}

    // 2) A) Correct  (multi-line)
    try {
      const lineRegex =
        /(^|\n)\s*([A-D])\s*[\)\.\:]\s*(.+?)(?=(\n\s*[A-D]\s*[\)\.\:])|$)/gis;
      const matches = [];
      let m;
      while ((m = lineRegex.exec(relevantText)) !== null) {
        matches.push({
          label: m[2].toUpperCase(),
          text: m[3].trim(),
          isCorrect: m[2].toUpperCase() === "A",
        });
      }
      if (matches.length) return matches;
    } catch (_) {}

    // 3) Inline A)Text B)Text…
    try {
      const inlineRegex = /([A-D])\s*[\)\.\:]\s*([^A-D]+)/g;
      const arr = [];
      let mm;
      while ((mm = inlineRegex.exec(relevantText)) !== null) {
        arr.push({
          label: mm[1].toUpperCase(),
          text: mm[2].trim(),
          isCorrect: mm[1].toUpperCase() === "A",
        });
      }
      if (arr.length) return arr;
    } catch (_) {}

    // 4) Simple pipe "|": A | Correct | B | Wrong
    try {
      const tokens = relevantText.split("|").map((s) => s.trim()).filter(Boolean);
      if (tokens.length >= 2 && /^[A-D]$/i.test(tokens[0])) {
        const opts = [];
        for (let i = 0; i < tokens.length; i += 2) {
          const label = tokens[i]?.toUpperCase();
          const text = tokens[i + 1];
          if (!label || !text) continue;
          opts.push({
            label,
            text,
            isCorrect: label === "A",
          });
        }
        if (opts.length) return opts;
      }
    } catch (_) {}

    console.warn("parseMCOptions failed:", relevantText);
    return [];
  };


  // ----------------------------------------------------------------------------
  // FIRESTORE LOADING (UNCHANGED)
  // ----------------------------------------------------------------------------
  useEffect(() => {
    if (!deck || !currentUser) return;
    const fetchFlashcards = async () => {
      try {
        setLoading(true);
        const flashRef = collection(db, "flashcard");
        const q = query(flashRef, where("deckId", "==", deck.id));
        const snap = await getDocs(q);
        const cards = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setFlashcards(cards);
      } catch (err) {
        console.error("Error loading flashcards:", err);
        setStatus("Error loading flashcards.");
      } finally {
        setLoading(false);
      }
    };
    fetchFlashcards();
  }, [deck, currentUser]);


  // ----------------------------------------------------------------------------
  // FILTER EMPTY FLASHCARDS (UNCHANGED)
  // ----------------------------------------------------------------------------
  useEffect(() => {
    if (flashcards.length === 0) return;
    const filtered = flashcards.filter(
      (fc) =>
        fc.front &&
        fc.front.trim() !== "" &&
        fc.back &&
        fc.back.trim() !== ""
    );
    setFilteredFlashcards(filtered);
    if (filtered.length === 0) setStatus("No flashcards with content to quiz.");
  }, [flashcards]);


  // ----------------------------------------------------------------------------
  // TIMER LOGIC (UNCHANGED)
  // ----------------------------------------------------------------------------
  useEffect(() => {
    if (!timerRunning || timeLeft === null) return;

    if (timeLeft <= 0) {
      setTimerRunning(false);
      autoSubmitDueToTimeout();
      return;
    }

    if (timeLeft === 300 && lastWarning !== 300) {
      alert("⚠️ 5 minutes remaining!");
      setLastWarning(300);
    }

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
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    setStatus(message);
    statusTimeoutRef.current = setTimeout(() => {
      setStatus("");
      statusTimeoutRef.current = null;
    }, duration);
  }

  const handleOpenSetup = () => {
    setShowSetup(true);
    setQuestionCount(filteredFlashcards.length);
  };


  // ----------------------------------------------------------------------------
  // START QUIZ
  // ----------------------------------------------------------------------------
  const handleStartQuiz = async () => {
    setLastWarning(null);
    setTimerRunning(false);
    setTimeLeft(selectedTime * 60);
    await startQuiz();
  };

  const startQuiz = async () => {
    if (filteredFlashcards.length === 0) {
      setStatus("No flashcards found in this deck.");
      return;
    }

    try {
      showStatus("Creating quiz...");
      setQuizStarted(false);

      const formatted = filteredFlashcards.map((fc) => ({
        question: fc.front,
        relevantText: fc.back,
        isMultipleChoice: fc.type === "Multiple Choice",
      }));

      const response = await fetch("/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcards: formatted }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Server error");
      }

      const { output } = await response.json();
      if (!Array.isArray(output)) throw new Error("Invalid quiz response");

      const processed = output.map((item) => {
        const q = item.question || "";
        const isMC = !!item.isMultipleChoice;
        const relevant = (item.relevantText ?? "").toString();

        if (!isMC) return [q, relevant, false, null];

        const parsedOptions = parseMCOptions(relevant);
        if (!parsedOptions.length) return [q, relevant, false, null];

        // --- SHUFFLE + NORMALIZE OPTIONS ---
        const shuffled = [...parsedOptions];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const normalized = shuffled.map((o, i) => ({
          label: ["A", "B", "C", "D"][i],
          text: o.text,
          isCorrect: o.isCorrect,
        }));

        const correctLabel = normalized.find((o) => o.isCorrect)?.label || null;

        return [q, normalized, true, correctLabel];
      });

      setProcessedFlashcards(processed);
      setCardStatuses(processed.map(() => ""));
      setCurrentIndex(0);
      setQuizStarted(true);
      setSelectedOption([]);
      setShortResponse([]);
      setSavedAnswers([]);
      setShowResult(false);
      setQuizStats(null);
      setTimerRunning(true);
      setShowSetup(false);

      showStatus(`Quiz ready (${processed.length} cards).`);
    } catch (err) {
      console.error("Quiz error:", err);
      showStatus(`Error: ${err.message}`);
    }
  };


  // ----------------------------------------------------------------------------
  // QUIZ HELPERS (RESET / AUTOSAVE / SUBMIT)
  // ----------------------------------------------------------------------------
  const resetQuizState = () => {
    setStatus("");
    setShortResponse([]);
    setCardStatuses([]);
    setShowResult(false);
    setQuizStats(null);
    setSavedAnswers([]);
    setSelectedOption([]);
    setTimeLeft(selectedTime * 60);
    setTimerRunning(true);
    setShowTimer(true);
  };

  const autoSubmitDueToTimeout = () => {
    setTimerRunning(false);
    setShowTimer(false);
    setStatus("Time's up! Submitting quiz...");
    saveAll();
    submitQuiz();
  };

  const saveAll = () => {
    setSavedAnswers((prev) => {
      const autoSaved = [...(prev || [])];

      processedFlashcards.forEach(([question, response, isMC], i) => {
        if (autoSaved[i] !== undefined) return;

        if (isMC) {
          const selected = selectedOption?.[i];
          if (selected) autoSaved[i] = selected;
        } else {
          const answer = shortResponse[i];
          if (answer?.trim()) autoSaved[i] = answer;
        }
      });

      return autoSaved;
    });
  };

  const submitQuiz = async () => {
    setStatus("Submitting quiz...");
    setTimerRunning(false);
    setShowTimer(false);
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
            const correctText =
              response.find((opt) => opt.label === correctLabel)?.text || "N/A";
            return correct
              ? "✅ Correct!"
              : `❌ Incorrect — correct answer: ${correctText}`;
          } else {
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
            return data.correct
              ? "✅ Correct!"
              : `❌ Incorrect — correct answer: ${response}`;
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
        <>
            <div className={styles.stickyToolbar}>
                <button
                    className={styles.backButton}
                    onClick={() => navigate("/flashcards")}
                >
                    ← Back
                </button>
            </div>

            <div className={styles.studySection}>
                {showSetup && (
                    <div className={styles.setupCard}>
                        <h2>Setup Your Quiz</h2>

                        {/* Question Count */}
                        <label>Questions (max {filteredFlashcards.length})</label>
                        <input
                            type="number"
                            min={1}
                            max={filteredFlashcards.length}
                            value={questionCount}
                            onChange={(e) => setQuestionCount(Number(e.target.value))}
                        />

                        {/* Time Selector */}
                        <label>Time:</label>
                        <select
                            value={selectedTime}
                            onChange={(e) => setSelectedTime(Number(e.target.value))}
                        >
                            {getAvailableTimes().map(t => (
                                <option key={t} value={t}>{t} minutes</option>
                            ))}
                        </select>

                        {/* Start Quiz */}
                        <button
                            className={styles.startQuizButton}
                            onClick={handleStartQuiz}
                        >
                            Start Quiz
                        </button>

                        <p className={styles.status}>{status}</p>
                    </div>
                )}
                {!quizStarted && !showSetup &&  (
                    <div className={styles.coverCard}>
                        <div className={styles.deckInfo}>
                            <h2
                                className={styles.deckTitle}
                                title={deck.title || "Untitled Deck"}
                            >
                                {deck.title?.length > 50 ? deck.title.slice(0, 50) + "…" : deck.title || "Untitled Deck"}
                            </h2>
                            <p className={styles.deckCategory}><strong>Category:</strong> {deck.category || "Uncategorized"}</p>
                            <div className={styles.deckDescription}>
                                <p className={styles.descLabel}><strong>Description:</strong></p>
                                <p className={styles.descText}>{deck.description?.trim() || "No description available."}</p>
                            </div>
                            <p className={styles.deckMeta}>{flashcards.length} cards</p>
                            <p className={styles.deckMeta}>Created: {deck.createdAt ? new Date(deck.createdAt.seconds ? deck.createdAt.seconds*1000 : deck.createdAt).toLocaleString() : "Unknown"}</p>
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
                    </div>
                )}

                {quizStarted && processedFlashcards.length > 0 && (
                <div className={styles.quizContainer}>
                    {/* Timer (bottom right) */}
                    {timerRunning && (
                        <div className={styles.timerBox}>
                            {Math.floor(timeLeft / 60)}:
                            {String(timeLeft % 60).padStart(2, "0")}
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
                            className={`${styles.questionBox} ${
                            savedAnswers[i] !== undefined ? styles.saved : styles.unsaved
                            }`}
                            onClick={() => {
                            const el = document.getElementById(`question-${i}`);
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                        >
                            {i + 1}
                            {savedAnswers[i] !== undefined && <span className={styles.checkmark}>✓</span>}
                        </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        className={styles.submitButton}
                        onClick={saveAll}
                    >
                        Save all answers
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
                            <button
                                className={styles.retryButton}
                                onClick={(resetQuizState)}
                                >
                                Retry Quiz
                            </button>
                        </div>
                    )}
                    <div className={styles.quizContent}>
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
                                {response.map(({ label, text }) => (
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
                                            })
                                            // clear savedAnswers for this index if it's different now
                                            setSavedAnswers(prev => {
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
                                ))}
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
                                    })
                                    // If a saved answer exists and is different from the new value, clear it
                                    setSavedAnswers(prev => {
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
                                            if (!selected) return;
                                            setSavedAnswers((prev) => {
                                                const copy = [...(prev || [])];
                                                copy[index] = selected;
                                                return copy;
                                            });
                                        } else {
                                            const userAnswer = shortResponse[index];
                                            if (!userAnswer?.trim()) return;
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
                            {cardStatuses[index] && (
                                <p className={styles.quizStatus}>{cardStatuses[index]}</p>
                            )}

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
        {!quizStarted && (
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
              <button className={styles.studyButton} onClick={startQuiz}>
                Create Quiz
              </button>
            </div>

            <p className={styles.status}>{status}</p>
          </div>
        )}

        {quizStarted && processedFlashcards.length > 0 && (
          <div className={styles.quizContainer}>
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
                        const el = document.getElementById(`question-${i}`);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                        setCurrentIndex(i);
                      }}
                    >
                      {i + 1}
                      {savedAnswers[i] !== undefined && <span className={styles.checkmark}>✓</span>}
                    </div>
                  ))}
                </div>
              </aside>
            )}

            {showResult && quizStats && (
              <div className={styles.resultsSummary}>
                <h2>Results Summary</h2>
                <p>Total Questions: {quizStats.total}</p>
                <p>Correct: ✅ {quizStats.correct}</p>
                <p>Incorrect: ❌ {quizStats.incorrect}</p>
                <h3>Grade: {quizStats.grade}%</h3>
                <button
                  className={styles.retryButton}
                  onClick={() => {
                    // reset but keep generated quiz in case user wants to retry without regenerating
                    setShowResult(false);
                    setQuizStats(null);
                    setCardStatuses(processedFlashcards.map(() => ""));
                    setSavedAnswers([]);
                    setSelectedOption([]);
                    setShortResponse([]);
                  }}
                >
                  Retry Quiz
                </button>
              </div>
            )}
            <div className={styles.quizContent}>
              {/* Quiz Form */}
              <form className={styles.studyBox} onSubmit={(e) => e.preventDefault()}>
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
                                onChange={() =>
                                  setSelectedOption((prev) => {
                                    const copy = [...(prev || [])];
                                    copy[index] = label;
                                    return copy;
                                  })
                                }
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
                        onChange={(e) =>
                          setShortResponse((prev) => {
                            const copy = [...(prev || [])];
                            copy[index] = e.target.value;
                            return copy;
                          })
                        }
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
                    onClick={async () => {
                      setStatus("Submitting quiz...");
                      setShowResult(true);

                      try {
                        let correctCount = 0;
                        const total = processedFlashcards.length;

                        const results = await Promise.all(
                          processedFlashcards.map(async ([question, response, isMC, correctLabel], index) => {
                            const userAnswer = savedAnswers[index];
                            if (userAnswer === undefined) return "No answer given";

                            if (isMC) {
                              // userAnswer is a label like "A", compare to correctLabel
                              const correct = userAnswer === correctLabel;
                              if (correct) correctCount++;
                              const correctText = response.find((opt) => opt.label === correctLabel)?.text || "N/A";
                              return correct ? "✅ Correct!" : `❌ Incorrect — correct answer: ${correctText}`;
                            } else {
                              // For short answer, response is a string containing the correct answer
                              const correctAnswerText = response;
                              // call your compare endpoint which presumably does fuzzy/semantic matching
                              const res = await fetch("/compare", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  userAnswer,
                                  correctAnswer: correctAnswerText,
                                }),
                              });
                              const data = await res.json();
                              if (data.correct) correctCount++;
                              return data.correct ? "✅ Correct!" : `❌ Incorrect — correct answer: ${correctAnswerText}`;
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
                    }}
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
