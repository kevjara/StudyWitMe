import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRef, useEffect } from "react";
// import { db } from "../services/firebase";
// import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import "./FlashcardGenerator.css";

function FlashcardGenerator() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [textInput, setTextInput] = useState("");
    const [file, setFile] = useState(null);
    const [aiPrompt, setAiPrompt] = useState("");
    const [status, setStatus] = useState("");
    const [flashcardPairs, setFlashcardPairs] = useState([]); // [question, relevantText]
    const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
    const [savedFlashcards, setSavedFlashcards] = useState([]); // { index, question, relevant, answer }
    const [savedIndices, setSavedIndices] = useState(new Set());
    const [userAnswers, setUserAnswers] = useState([]); // per-card answers
    const [flashcardsGenerated, setFlashcardsGenerated] = useState(false);

    // UI modals
    const [showDoneConfirm, setShowDoneConfirm] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    const MAX_CHARACTERS = 50000;
    const bottomRef = useRef(null);

    useEffect(() => {
    if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
    }, [flashcardPairs, currentFlashcardIndex, status, showDoneConfirm, showCancelConfirm]);

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

    // Save current flashcard locally (not to DB yet)
    const handleSave = () => {
        if (!flashcardsGenerated) return;
        if (currentFlashcardIndex >= flashcardPairs.length) return;

        const [question, relevant] = flashcardPairs[currentFlashcardIndex];
        const answer = (userAnswers[currentFlashcardIndex] || "").trim();

        setSavedFlashcards((prev) => {
        const existingIdx = prev.findIndex((p) => p.index === currentFlashcardIndex);
            if (existingIdx !== -1) {
                // update existing
                const copy = [...prev];
                copy[existingIdx] = { index: currentFlashcardIndex, question, relevant, answer };
                return copy;
            } else {
                return [...prev, { index: currentFlashcardIndex, question, relevant, answer }];
            }
        });

        setSavedIndices((prev) => {
            const newSet = new Set(prev);
            newSet.add(currentFlashcardIndex);
            return newSet;
        });

        // Move forward automatically if not last card
        setCurrentFlashcardIndex((i) => {
            const next = i + 1;
            return next < flashcardPairs.length ? next : i;
        });
        setStatus("Saved card locally.");
    };

      // Done flow: show confirm modal -> on Yes, "save deck" (simulated) then reset generator
    const handleDoneClick = () => {
        setShowDoneConfirm(true);
    };

    const handleDoneConfirmYes = async () => {
    setShowDoneConfirm(false);
    setStatus("Saving deck...");
    try {
        // ----- PLACEHOLDER: persist to DB here -----
        // At this step we DO NOT write to Firestore. Replace this block with real DB code.
        // Example (pseudo):
        // const deckDocRef = await addDoc(collection(db, "deck"), { ownerId: currentUser.uid, title, ... });
        // then add each savedFlashcards item with deckID = deckDocRef.id
        console.log("Simulated deck save. Deck contents:", savedFlashcards);
         // simulate delay
        await new Promise((res) => setTimeout(res, 400));

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
        setStatus("Deck saved (simulation). Generator reset.");
        } catch (err) {
        console.error("Error saving deck:", err);
        setStatus("Error saving deck. Check console.");
        }
    };

    const handleDoneConfirmNo = () => {
        setShowDoneConfirm(false);
        setStatus("Continue editing your flashcards.");
    };

    // Cancel flow: prompt, Yes clears deck (no save), Never mind closes modal
    const handleCancelClick = () => {
        setShowCancelConfirm(true);
    };

    const handleCancelConfirmYes = () => {
        setShowCancelConfirm(false);
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
        <div className="flashcard-generator">
            <h2>You must be signed in to use the Flashcard Generator</h2>
            <button onClick={() => navigate("/login")}>Go to Login</button>
        </div>
        );
    }

    return (
        <div className="flashcard-generator">
            {/* Back Button */}
            <button className="back-btn" onClick={() => navigate("/main")}>
                ← Back to Main Menu
            </button>

            <h2>Flashcard Generator</h2>

            <form onSubmit={handleSubmit} className="generator-form">
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
                    <input type="file" accept=".pdf" onChange={handleFileChange} />
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
                    className="generate-btn"
                    disabled={flashcardsGenerated}
                >
                    {flashcardsGenerated ? "Flashcards Generated" : "Generate Flashcards"}
                </button>

                <p className="status">{status}</p>

                {/* Flashcard viewer */}
                {currentFlashcard && (
                    <div className="flashcard-viewer">
                        {/* Cancel button (top-right) */}
                        <button className="cancel-btn" type="button" onClick={handleCancelClick}>
                            Cancel
                        </button>

                        <div className="viewer-inner">
                            {/* Main content */}
                            <div className="viewer-content">
                                <h3>Flashcard {currentFlashcardIndex + 1} / {flashcardPairs.length}</h3>
                                <p><strong>Q:</strong> {currentFlashcard[0]}</p>
                                <p><strong>Relevant:</strong> {currentFlashcard[1]}</p>
                                <textarea
                                    value={userAnswers[currentFlashcardIndex] || ""}
                                    onChange={(e) => handleAnswerChange(e.target.value)}
                                    placeholder="Your Answer..."
                                />
                                <div className="flashcard-actions">
                                    <div className="left-actions">
                                        <button type="button" onClick={handlePrev}>
                                            &lt; Prev
                                        </button>
                                        <button type="button" onClick={handleNext}>
                                            Next &gt;
                                        </button>
                                    </div>

                                    <div className="right-actions">
                                        <button type="button" onClick={handleSave}>
                                            Save
                                        </button>
                                    </div>
                                </div>

                                {/* Done below Save */}
                                <div className="done-row">
                                    <button type="button" className="done-btn" onClick={handleDoneClick}>
                                        Done
                                    </button>
                                </div>
                                {/* small saved indicator */}
                                {savedIndices.has(currentFlashcardIndex) && (
                                    <div className="saved-indicator">Saved ✓</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
        
                {/* End message */}
                {flashcardPairs.length > 0 && currentFlashcardIndex >= flashcardPairs.length && (
                    <div className="done-message">
                        <h3>All flashcards completed!</h3>
                        <p>You saved {savedFlashcards.length} answers.</p>
                    </div>
                )}
            </form>

            {/* Done confirmation modal */}
            {showDoneConfirm && (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                <div className="modal">
                    <p>Are you satisfied with these flashcards?</p>
                    <div className="modal-actions">
                    <button onClick={handleDoneConfirmYes}>Yes</button>
                    <button onClick={handleDoneConfirmNo}>No</button>
                    </div>
                </div>
                </div>
            )}

            {/* Cancel confirmation modal */}
            {showCancelConfirm && (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                <div className="modal">
                    <p>Are you sure? All flashcards will be lost.</p>
                    <div className="modal-actions">
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