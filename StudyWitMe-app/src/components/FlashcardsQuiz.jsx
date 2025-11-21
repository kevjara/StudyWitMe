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
  const [processedFlashcards, setProcessedFlashcards] = useState([]); // each item: [question, responseOrOptions, isMC, correctLabel]
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedOption, setSelectedOption] = useState([]); // array of labels for MC
  const [showResult, setShowResult] = useState(false);
  const [shortResponse, setShortResponse] = useState([]); // array of strings for short answers
  const statusTimeoutRef = useRef(null);
  const [cardStatuses, setCardStatuses] = useState([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState([]); // user's saved answers (label or text)
  const [quizStats, setQuizStats] = useState(null); // { correct, incorrect, total, grade }

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
   * parseMCOptions - robust parser that supports several possible
   * generator outputs:
   * 1) "|||A|||Correct|||B|||Wrong1|||C|||Wrong2|||D|||Wrong3"
   * 2) "A) Correct\nB) Wrong1\nC) Wrong2\nD) Wrong3"
   * 3) "A. Correct\nB. Wrong1\n..."
   * 4) fallback: tries to split on pipes or pairs if possible
   *
   * returns: [{ label: "A", text: "...", isCorrect: boolean }, ...]
   */
  const parseMCOptions = (relevantText) => {
    if (!relevantText || typeof relevantText !== "string") return [];

    // 1) Try the strict triple-pipe format first
    try {
      const pipeParts = relevantText.split("|||").map((s) => s.trim());
      // If first token is empty due to leading |||, remove it
      if (pipeParts.length > 0 && pipeParts[0] === "") pipeParts.shift();

      // Expect pairs like ["A", "Correct", "B", "Wrong", ...]
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
      // fall through to next strategies
    }

    // 2) Try common labeled-lines format: "A) Text" or "A. Text" or "A: Text"
    // We'll capture groups for A-D
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

    // 3) Try "A)Text B)Text" single-line or split by newlines with label prefix
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

    // 4) Fallback - try splitting by pipe '|' tokens and pair them
    try {
      const tokens = relevantText.split("|").map((s) => s.trim()).filter(Boolean);
      // tokens like ["A", "Correct", "B", "Wrong", "C", "Wrong"]
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

    // If nothing worked, return empty to let caller fallback to short-answer
    console.warn("parseMCOptions: unable to parse MC options from:", relevantText);
    return [];
  };

  const startQuiz = async () => {
    if (flashcards.length === 0) {
      setStatus("No flashcards found in this deck.");
      return;
    }

    try {
      showStatus("Creating quiz...");
      setQuizStarted(false);

      // Filter out empty-front cards
      const filteredFlashcards = flashcards.filter(
        (fc) => fc.front && fc.front.trim() !== ""
      );
      if (filteredFlashcards.length === 0) {
        setStatus("No flashcards with content to quiz.");
        return;
      }

      // Format flashcards for the backend - keep using front/back fields as the source content
      const formatted = filteredFlashcards.map((fc) => ({
        question: fc.front,
        relevantText: fc.back,
        isMultipleChoice: fc.type === "Multiple Choice",
      }));

      // POST to your new /quiz backend route
      const response = await fetch("/quiz", {
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
        throw new Error("Invalid quiz response from server");
      }

      // IMPORTANT: The backend returns fully NEW quiz items. Use them directly.
      // Each output item should be { question, relevantText, isMultipleChoice }
      const outputs = data.output;

      const processed = outputs.map((item, idx) => {
        const q = item.question || "";
        const isMC = !!item.isMultipleChoice;
        const relevant = (item.relevantText ?? "").toString();

        if (!isMC) {
          // Short answer: relevant is a plain string (the correct answer)
          return [q, relevant, false, null];
        }

        // Multiple choice: parse options from the various possible formats
        const parsedOptions = parseMCOptions(relevant);

        // If parsing failed, fall back to short answer (prevents empty MC blocks)
        if (!parsedOptions || parsedOptions.length === 0) {
          console.warn(
            `Quiz item ${idx} marked MC but parser returned 0 options. Falling back to short-answer. RelevantText:`,
            relevant
          );
          return [q, relevant, false, null];
        }

        // Shuffle the parsed options (shuffle whole objects to keep labels paired with text)
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

      showStatus(`Quiz ready (${processed.length} questions).`);
    } catch (err) {
      console.error("Quiz error:", err);
      showStatus(`Error: ${err.message}`);
    }
  };

  const setCardStatus = (message) => {
    setCardStatuses((prev) => {
      const newStatuses = [...prev];
      newStatuses[currentIndex] = message;
      return newStatuses;
    });
  };

  const resetQuizState = () => {
    setSelectedOption([]);
    setShowResult(false);
    setShortResponse([]);
    setCardStatus("");
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
