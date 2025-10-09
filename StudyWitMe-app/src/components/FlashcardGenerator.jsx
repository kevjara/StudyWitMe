import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRef, useEffect } from "react";
// import { db } from "../services/firebase";
// import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import styles from "./FlashcardGenerator.module.css";

function FlashcardGenerator() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [textInput, setTextInput] = useState("");
    const [file, setFile] = useState(null);
    const [aiPrompt, setAiPrompt] = useState("");
    const [status, setStatus] = useState("");
    const [flashcardPairs, setFlashcardPairs] = useState([]); // [question, relevantText]
    const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
    const [savedFlashcards, setSavedFlashcards] = useState([]);
    const [showDeckPrompt, setShowDeckPrompt] = useState(false);
    const [deckTitle, setDeckTitle] = useState("");
    const [deckDescription, setDeckDescription] = useState("");
    const [savedIndices, setSavedIndices] = useState(new Set());
    const [userAnswers, setUserAnswers] = useState([]); // per-card answers
    const [flashcardsGenerated, setFlashcardsGenerated] = useState(false);
    const fileInputRef = useRef(null);

    // UI modals
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    const MAX_CHARACTERS = 50000;
    const bottomRef = useRef(null);

    useEffect(() => {
    if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
    }, [flashcardPairs, currentFlashcardIndex, showCancelConfirm]);

// --- Helper: safe JSON parse ---
    const safeJsonParse = async (res) => {
        const text = await res.text(); // read body once
        try {
            return JSON.parse(text);
        } catch {
            return { error: text || "Unknown error (non-JSON response)" };
        }
    };

    //Handle File Upload
    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    // Generate flashcards (called on form submit)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (flashcardsGenerated) return; //prevent multiple generation

        setStatus("Processing...");

        try {
            let res;
            if (file) {
                // PDF upload with FormData
                const formData = new FormData();
                formData.append("pdf", file);
                res = await fetch("/generate", { method: "POST", body: formData });
            } 
            else {
                let textToSend = textInput.trim();
                if (!textToSend) {
                    setStatus("Please enter some text or upload a file.");
                    return;
                }
                if (aiPrompt) {
                    textToSend += `\n\nInstructions: ${aiPrompt}`;
                }
                if (textToSend.length > MAX_CHARACTERS) {
                    setStatus(`Text too long (${textToSend.length} chars). Please shorten it.`);
                    return;
                }
                res = await fetch("/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ input: textToSend }),
                });
            }

            if (!res.ok) {
                const errorData = await safeJsonParse(res);
                setStatus(`File upload failed (${res.status}): ${errorData.error}`);
                return;
            }

            const data = await safeJsonParse(res);
            let cleanOutput = (data.output || "").trim()

            if (!cleanOutput) {
                setStatus("Error: AI returned no output.");
                return;
            }

            // Handle AI returning code fences
            if (cleanOutput.startsWith("```")) {
                cleanOutput = cleanOutput.replace(/^```(json)?/, "").replace(/```$/, "").trim();
            }

            try {
                const flashcards = JSON.parse(cleanOutput);
                if (!Array.isArray(flashcards)) {
                    console.error("AI output parsed but is not an array:", flashcards);
                    setStatus("Error: AI returned unexpected format.");
                    return;
                }
                const pairs = flashcards.map((f) => [f.question, f.relevantText]);

                // initialize per-card answers array

                setFlashcardPairs(pairs);
                setCurrentFlashcardIndex(0);
                setSavedFlashcards([]);
                setSavedIndices(new Set());
                setFlashcardsGenerated(true)
                setStatus("Flashcards ready!");
            } catch (parseErr) {
                console.error("Failed to parse AI output:", cleanOutput, parseErr);
                setStatus("Error: Could not parse AI output. Check console for details.");
            }
        } 
        catch (err) {
            console.error("Unexpected error:", err);
            setStatus(`Unexpected error: ${err.message}`);
        }
    };

    // Navigate previous/next
    const handlePrev = () => {
        setCurrentFlashcardIndex((i) => Math.max(0, i - 1));
    };
    const handleNext = () => {
        setCurrentFlashcardIndex((i) => Math.min(flashcardPairs.length - 1, i + 1));
    };

    // Keep per-card answer state
    const handleAnswerChange = (value) => {
        setUserAnswers((prev) => {
        const copy = [...prev];
        copy[currentFlashcardIndex] = value;
        return copy;
        });
    };

    const handleDoneConfirmYes = async () => {
    setStatus("Saving deck...");
    try {
        // ----- PLACEHOLDER: persist to DB here -----
        // At this step we DO NOT write to Firestore. Replace this block with real DB code.
        // Example (pseudo):
        // const deckDocRef = await addDoc(collection(db, "deck"), { ownerId: currentUser.uid, title, ... });
        // then add each savedFlashcards item with deckID = deckDocRef.id
        console.log("Simulated deck save. Deck contents:", savedFlashcards);
        await new Promise((res) => setTimeout(res, 400));

        setStatus("Deck saved successfully!");

        // Optionally delay resetting UI so user sees the success message briefly
        setTimeout(() => {
            // Reset/refresh generator so user can create more flashcards
            setFlashcardPairs([]);
            setUserAnswers([]);
            setSavedFlashcards([]);
            setSavedIndices(new Set());
            setCurrentFlashcardIndex(0);
            setFlashcardsGenerated(false);
            setTextInput("");
            setFile(null);
            setAiPrompt("");
            setDeckTitle("");
            setDeckDescription("");
            setStatus("");
            setShowDeckPrompt(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }, 800);
        } catch (err) {
            console.error("Error saving deck:", err);
            setStatus("Error saving deck. Check console.");
        }
    };

    // Cancel flow: prompt, Yes clears deck (no save), Never mind closes modal
    const handleCancelClick = () => {
        setShowCancelConfirm(true);
    };

    const handleCancelConfirmYes = () => {
        setShowCancelConfirm(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        // Clear state, do not save anything
        setFlashcardPairs([]);
        setUserAnswers([]);
        setSavedFlashcards([]);
        setSavedIndices(new Set());
        setCurrentFlashcardIndex(0);
        setFlashcardsGenerated(false);
        setTextInput("");
        setFile(null);
        setAiPrompt("");
        setStatus("Deck canceled and discarded.");
    };

    const handleCancelConfirmNo = () => {
        setShowCancelConfirm(false);
        setStatus("Continue editing your flashcards.");
    };

    // Render current flashcard
    const currentFlashcard =
        flashcardPairs.length > 0 && currentFlashcardIndex < flashcardPairs.length
        ? flashcardPairs[currentFlashcardIndex]
        : null;

    if (!currentUser) {
        return (
        <div className={styles.flashcardGenerator}>
            <h2>You must be signed in to use the Flashcard Generator</h2>
            <button onClick={() => navigate("/login")}>Go to Login</button>
        </div>
        );
    }

    return (
        <div className={styles.flashcardGenerator}>
            {/* Back Button */}
            <button className={styles.backBtn} onClick={() => navigate("/main")}>
                ← Back to Main Menu
            </button>

            <h2>Flashcard Generator</h2>

            <form onSubmit={handleSubmit} className={styles.generatorForm}>
                {/* Text Input */}
                <label>
                    Enter Text Directly:
                    <textarea
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Paste or type text here..."
                    />
                </label>

                {/* File Upload */}
                <label>
                    Upload File (PDF):
                        <input
                            type="file"
                            accept=".pdf"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                        />
                </label>

                {/* AI Prompt */}
                <label>
                    AI Prompt:
                    <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Enter your instructions for AI (e.g., generate 10 flashcards)..."
                    />
                </label>

                <button
                    type="submit"
                    className={styles.generateBtn}
                    disabled={flashcardsGenerated}
                >
                    {flashcardsGenerated ? "Flashcards Generated" : "Generate Flashcards"}
                </button>

                <p className={styles.status}>{status}</p>

                {/* Flashcard viewer */}
                {!showDeckPrompt && currentFlashcard && (
                <div className={styles.flashcardViewer}>
                    {/* Cancel button (top-right) */}
                    <button className={styles.cancelBtn} type="button" onClick={handleCancelClick}>
                    Cancel
                    </button>

                    <div className={styles.viewerInner}>
                    <div className={styles.viewerContent}>
                        <h3>Flashcard {currentFlashcardIndex + 1} / {flashcardPairs.length}</h3>
                        <p><strong>Q:</strong> {currentFlashcard[0]}</p>
                        <p><strong>Relevant:</strong> {currentFlashcard[1]}</p>
                        <textarea
                        value={userAnswers[currentFlashcardIndex] || ""}
                        onChange={(e) => handleAnswerChange(e.target.value)}
                        placeholder="Your Answer..."
                        />
                        <div className={styles.flashcardActions}>
                            <div className={styles.leftActions}>
                                <button type="button" onClick={handlePrev}>
                                &lt; Prev
                                </button>
                                <button type="button" onClick={handleNext}>
                                Next &gt;
                                </button>
                            </div>

                            <div className={styles.rightActions}>
                            <button
                                type="button"
                                onClick={() => {
                                const [question, relevant] = currentFlashcard;
                                const answer = userAnswers[currentFlashcardIndex] || "";

                                setSavedFlashcards((prev) => {
                                    const existingIdx = prev.findIndex((f) => f.index === currentFlashcardIndex);
                                    if (existingIdx !== -1) {
                                    // Update existing saved card
                                    const copy = [...prev];
                                    copy[existingIdx] = { index: currentFlashcardIndex, front: question, back: answer };
                                    return copy;
                                    } else {
                                    // Add new saved card
                                    return [...prev, { index: currentFlashcardIndex, front: question, back: answer }];
                                    }
                                });

                                // Ensure index is marked as saved
                                setSavedIndices((prev) => new Set(prev).add(currentFlashcardIndex));
                                }}
                            >
                                {savedIndices.has(currentFlashcardIndex) ? "Update" : "Save"}
                            </button>

                            {savedIndices.has(currentFlashcardIndex) && (
                                <button
                                type="button"
                                onClick={() => {
                                    setSavedFlashcards((prev) =>
                                    prev.filter((card) => card.index !== currentFlashcardIndex)
                                    );
                                    setSavedIndices((prev) => {
                                    const newSet = new Set(prev);
                                    newSet.delete(currentFlashcardIndex);
                                    return newSet;
                                    });
                                }}
                                >
                                Remove
                                </button>
                            )}
                            </div>
                        </div>

                        <div className={styles.doneRow}>
                        <button
                            type="button"
                            className={styles.doneBtn}
                            onClick={() => setShowDeckPrompt(true)}
                        >
                            Done
                        </button>
                        </div>

                        {savedIndices.has(currentFlashcardIndex) && (
                        <div className={styles.savedIndicator}>Saved ✓</div>
                        )}
                    </div>
                    </div>
                </div>
                )}

                {/* Deck title + description prompt */}
                {showDeckPrompt && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true">
                    <div className={styles.modal}>
                    <h3>Finalize Deck</h3>
                    <label>
                        Deck Title:
                        <input
                        type="text"
                        value={deckTitle}
                        onChange={(e) => setDeckTitle(e.target.value)}
                        placeholder="Enter a title for your deck"
                        />
                    </label>
                    <label>
                        Description:
                        <textarea
                        value={deckDescription}
                        onChange={(e) => setDeckDescription(e.target.value)}
                        placeholder="Enter a short description (optional)"
                        />
                    </label>
                    <div className={styles.modalActions}>
                        <button
                        onClick={() => {
                            if (!deckTitle.trim()) {
                            alert("Please enter a deck title first.");
                            return;
                            }
                            handleDoneConfirmYes();
                        }}
                        >
                        Finish
                        </button>
                        <button onClick={() => setShowDeckPrompt(false)}>Cancel</button>
                    </div>
                    </div>
                </div>
                )}
            </form>

            {/* Cancel confirmation modal */}
            {showCancelConfirm && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true">
                <div className={styles.modal}>
                    <p>Are you sure? All flashcards will be lost.</p>
                    <div className={styles.modalActions}>
                    <button onClick={handleCancelConfirmYes}>Yes</button>
                    <button onClick={handleCancelConfirmNo}>Never mind</button>
                    </div>
                </div>
                </div>
            )}
            <div ref={bottomRef}></div>
        </div>
    );
}

export default FlashcardGenerator;