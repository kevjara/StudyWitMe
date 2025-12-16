import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  runTransaction
} from "firebase/firestore";
import styles from "./FlashcardsQuiz.module.css";

function FlashcardsQuiz() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const deck = state?.deck;

  const BASE_COMPLETION_XP = 40;
  const BONUS_COMPLETION_XP = 60;
  const BASE_LEVEL_XP = 100;
  const LEVEL_INCREMENT = 25;

  // Core data
  const [flashcards, setFlashcards] = useState([]);
  const [filteredFlashcards, setFilteredFlashcards] = useState([]);
  const [processedFlashcards, setProcessedFlashcards] = useState([]); // each item: [question, responseOrOptions, isMC, correctLabel]
  const [currentIndex, setCurrentIndex] = useState(0);

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
  const [quizStats, setQuizStats] = useState(null); // { correct, incorrect, total, grade }

  // Setup & timer (from version 2)
  const [lastWarning, setLastWarning] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [selectedTime, setSelectedTime] = useState(15); // minutes
  const [timeLeft, setTimeLeft] = useState(null); // seconds
  const [timerRunning, setTimerRunning] = useState(false);

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
    if (flashcards.length === 0) {
      setFilteredFlashcards([]);
      return;
    }

    const filtered = flashcards.filter(
      (fc) => fc.front && fc.front.trim() !== "" && fc.back && fc.back.trim() !== ""
    );

    setFilteredFlashcards(filtered);

    if (!questionCount) setQuestionCount(filtered.length);
  }, [flashcards]);

  // Timer effect (from Version 2)
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
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    setStatus(message);
    statusTimeoutRef.current = setTimeout(() => {
      setStatus("");
      statusTimeoutRef.current = null;
    }, duration);
  }

  const parseMCOptions = (relevantText) => {
    if (!relevantText || typeof relevantText !== "string") return [];

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
            isCorrect: label === "A",
          });
        }
        if (options.length) return options;
      }
    } catch (e) {}

    return [];
  };

  const handleOpenSetup = () => {
    setShowSetup(true);
    setQuestionCount(filteredFlashcards.length);
  };

  const getAvailableTimes = () => {
    const blocks = Math.ceil(Math.max(1, questionCount) / 12);
    const times = [];
    for (let i = 1; i <= blocks; i++) {
      const minutes = i * 15;
      if (minutes <= 120) times.push(minutes);
    }
    if (times.length === 0) times.push(15);
    return times;
  };

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

      const data = await response.json();
      const outputs = data.output;

      const processed = outputs.map((item) => {
        const q = item.question;
        const isMC = item.isMultipleChoice;
        const relevant = item.relevantText;

        if (!isMC) return [q, relevant, false, null];

        const parsed = parseMCOptions(relevant);
        const shuffled = [...parsed].sort(() => Math.random() - 0.5);
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
      setQuizStarted(true);
      setSelectedOption([]);
      setShortResponse([]);
      setSavedAnswers([]);
      setShowResult(false);
      setQuizStats(null);

      setTimerRunning(true);
      setShowSetup(false);
    } catch (err) {
      console.error(err);
      showStatus("Error creating quiz.");
    }
  };

  const calculateSessionXp = (score, total) => {
    if (total === 0) return BASE_COMPLETION_XP;
    const accuracy = score / total;
    return Math.round(BASE_COMPLETION_XP + BONUS_COMPLETION_XP * accuracy);
  };

  const xpNeededForLevel = (level) => {
    return (BASE_LEVEL_XP * level) + (LEVEL_INCREMENT * Math.max(level - 1, 0));
  };

  const calculateLevelFromXp = (xpTotal) => {
    let level = 1;
    let remainingXp = xpTotal;
    let threshold = xpNeededForLevel(level);

    while (remainingXp >= threshold) {
      remainingXp -= threshold;
      level += 1;
      threshold = xpNeededForLevel(level);
    }

    return level;
  };

  const awardXp = async (score, total) => {
    if (!currentUser) return 0;

    const xpEarned = calculateSessionXp(score, total);
    const userRef = doc(db, "users", currentUser.uid);

    try {
      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        const currentXp = userSnap.exists() ? userSnap.data().userXP || 0 : 0;
        const newTotalXp = currentXp + xpEarned;
        const newLevel = calculateLevelFromXp(newTotalXp);

        transaction.set(
          userRef,
          { userXP: newTotalXp, userLevel: newLevel },
          { merge: true }
        );
      });

      showStatus(`+${xpEarned} XP earned`);
      return xpEarned;
    } catch (err) {
      console.error("Error awarding XP:", err);
      return 0;
    }
  };

  const autoSubmitDueToTimeout = () => {
    setTimerRunning(false);
    saveAll();
    setTimeout(() => submitQuiz(), 250);
  };

  const saveAll = () => {
    setSavedAnswers((prev) => {
      const autoSaved = [...(prev || [])];
      processedFlashcards.forEach(([q, r, isMC], i) => {
        if (autoSaved[i] !== undefined) return;
        autoSaved[i] = isMC ? selectedOption[i] : shortResponse[i];
      });
      return autoSaved;
    });
  };

  const submitQuiz = async () => {
    setShowResult(true);
    setTimerRunning(false);

    let correctCount = 0;
    const total = processedFlashcards.length;

    const results = await Promise.all(
      processedFlashcards.map(async ([q, r, isMC, correctLabel], i) => {
        const userAnswer = savedAnswers[i];
        if (userAnswer === undefined) return "No answer";

        if (isMC) {
          const correct = userAnswer === correctLabel;
          if (correct) correctCount++;
          return correct ? "✅ Correct!" : "❌ Incorrect";
        } else {
          const res = await fetch("/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userAnswer, correctAnswer: r }),
          });
          const data = await res.json();
          if (data.correct) correctCount++;
          return data.correct ? "✅ Correct!" : "❌ Incorrect";
        }
      })
    );

    setCardStatuses(results);
    setQuizStats({
      correct: correctCount,
      incorrect: total - correctCount,
      total,
      grade: ((correctCount / total) * 100).toFixed(1),
    });

    await awardXp(correctCount, total);
  };

  if (loading) return <p>Loading...</p>;
  if (!deck) return <p>No deck selected.</p>;

  return (
    <>
      <button onClick={() => navigate("/flashcards")}>← Back</button>

      {!quizStarted && !showSetup && (
        <button onClick={handleOpenSetup}>Create Quiz</button>
      )}

      {showSetup && (
        <div>
          <label>Time</label>
          <select value={selectedTime} onChange={(e) => setSelectedTime(Number(e.target.value))}>
            {getAvailableTimes().map((t) => (
              <option key={t} value={t}>{t} minutes</option>
            ))}
          </select>
          <button onClick={handleStartQuiz}>Start Quiz</button>
        </div>
      )}

      {quizStarted && (
        <>
          {timerRunning && timeLeft !== null && (
            <div>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
            </div>
          )}

          {processedFlashcards.map(([q, r, isMC], i) => (
            <div key={i}>
              <h3>{q}</h3>

              {isMC ? (
                r.map((o) => (
                  <label key={o.label}>
                    <input
                      type="radio"
                      checked={selectedOption[i] === o.label}
                      onChange={() => {
                        const copy = [...selectedOption];
                        copy[i] = o.label;
                        setSelectedOption(copy);
                      }}
                    />
                    {o.label}) {o.text}
                  </label>
                ))
              ) : (
                <textarea
                  value={shortResponse[i] || ""}
                  onChange={(e) => {
                    const copy = [...shortResponse];
                    copy[i] = e.target.value;
                    setShortResponse(copy);
                  }}
                />
              )}

              {!showResult && (
                <button
                  onClick={() => {
                    const copy = [...savedAnswers];
                    copy[i] = isMC ? selectedOption[i] : shortResponse[i];
                    setSavedAnswers(copy);
                  }}
                >
                  Save
                </button>
              )}

              {cardStatuses[i] && <p>{cardStatuses[i]}</p>}
            </div>
          ))}

          {!showResult && <button onClick={submitQuiz}>Submit</button>}
        </>
      )}
    </>
  );
}

export default FlashcardsQuiz;
