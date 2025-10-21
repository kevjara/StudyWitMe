import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRef, useEffect } from "react";
import { db } from "../services/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import styles from "./FlashcardGenerator.module.css";
import { categories } from "./categories";

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
    const [flashcardType, setFlashcardType] = useState("Short Response"); // default
    const [savedIndices, setSavedIndices] = useState(new Set());
    const [userAnswers, setUserAnswers] = useState([]); // per-card answers
    const [flashcardsGenerated, setFlashcardsGenerated] = useState(false);
    const fileInputRef = useRef(null);
    const [charCount, setCharCount] = useState(0); //track # of char in text input
    const [startPage, setStartPage] = useState('1'); //starPage button
    const [endPage, setEndPage] = useState('1'); //endPage button
    const [editedAnswer, setEditedAnswer] = useState("");
    const [isButtonLocked, setIsButtonLocked] = useState(false);
    //Used in Finalize Deck
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSubcategory, setSelectedSubcategory] = useState("");

    // UI modals
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    //manage view states ("form", "loading", "viewer")
    const [view, setView] = useState("form");

    // -------------------- Study Mode Section --------------------
    const [isStudying, setIsStudying] = useState(false);
    // -----------------------------
    // Dummy flashcards for study testing
    const dummyFlashcards = [
    {
        question: "What is the capital of France?",
        relevantText: "Paris",
        isMultipleChoice: false,
    },
    {
        question: "Which of the following are prime numbers?",
        relevantText: "2, 3, 4, 5",
        isMultipleChoice: true,
    },
    {
        question: "Who wrote 'To Kill a Mockingbird'?",
        relevantText: "Harper Lee",
        isMultipleChoice: false,
    },
    ];
    // -------------------- Study Mode Section --------------------

    const MAX_CHARACTERS = 3_500_000;
    const bottomRef = useRef(null);

    // When switching cards, load the saved answer (or blank if none)
    useEffect(() => {
        const saved = userAnswers[currentFlashcardIndex] || "";
        setEditedAnswer(saved);
    }, [currentFlashcardIndex, userAnswers]);

    useEffect(() => {
    if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
    }, [flashcardPairs, currentFlashcardIndex, showCancelConfirm]);

    //Handle File Upload
    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
        } else {
            // If the user canceled, do nothing — keep the existing file
            e.target.value = ""; // reset the input’s value safely
        }
    };

   {/* -------------------- Study Mode Section -------------------- */}
    const handleStartStudying = async () => {
        try {
            const response = await fetch("/study", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ flashcards: dummyFlashcards }),
            });

            const data = await response.json();
            console.log("📘 Study API response:", data.output || data.error);
        } catch (err) {
            console.error("❌ Error calling /study:", err);
        }
    };
    {/* -------------------- Study Mode Section -------------------- */}


    // Generate flashcards (called on form submit)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (flashcardsGenerated) return;

        setFlashcardPairs([]);
        setSavedFlashcards([]);
        setCurrentFlashcardIndex(0);

        try {
            let response;

            if (file) {
                // --- PDF upload with FormData ---
                const formData = new FormData();
                formData.append("pdf", file);

                // Append to form data (backend handles validation/defaults)
                const start = parseInt(startPage, 10);  // startPage is state
                const end = parseInt(endPage, 10);      // endPage is state

                if (isNaN(start) || isNaN(end) || start > end) {
                    setStatus("Invalid page range.");
                    return;
                }

                formData.append("startPage", start);
                formData.append("endPage", end)
                formData.append("instructions", aiPrompt);
                setStatus("");
                // Show loading animation
                setView("loading")

                // Send to backend
                response = await fetch("/generate", { method: "POST", body: formData });
            } 
            
            else {
                // --- Direct text input ---
                const textToSend = textInput.trim();
                if (!file && !textToSend) {
                    setStatus("Please enter some text or upload a file.");
                    return;
                }
                if (textToSend.length > MAX_CHARACTERS) {
                    setStatus(`Text too long (${textToSend.length} chars). Please shorten it.`);
                    return;
                }

                // Show loading animation
                setView("loading");

                response = await fetch("/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        input: textToSend,
                        instructions: aiPrompt,
                    }),
                });
            }


            // --- Handle backend response ---
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const message = errorData.error || "Unknown error from server.";
                setStatus(`❌ ${message}`);
                // stay in form view if error occurs
                setView("form");
                return;
            }

            const data = await response.json();

            if (!data.output) {
                setStatus("No flashcards returned.");
                setView("form");
                return;
            }

            let output = data.output;

            // --- Case 1: backend returned parsed JSON array ---
            if (Array.isArray(output)) {
                const pairs = output.map(f => [f.question, f.relevantText]);
                setFlashcardPairs(pairs);
                setStatus(`✅ Generated ${pairs.length} flashcards`);
            } 
            
            // --- Case 2: backend returned JSON text ---
            else {
                let cleanOutput = output.trim();
                if (cleanOutput.startsWith("```")) {
                    cleanOutput = cleanOutput
                        .replace(/^```(json)?/, "")
                        .replace(/```$/, "")
                        .trim();
                }

                try {
                    const parsed = JSON.parse(cleanOutput);
                    const pairs = parsed.map(f => [f.question, f.relevantText]);
                    setFlashcardPairs(pairs);
                    setStatus(`✅ Generated ${pairs.length} flashcards`);
                } catch (err) {
                    console.error("Failed to parse backend output:", cleanOutput, err);
                    setStatus("❌ Error: Could not parse backend output. Check console.");
                    setView("form");
                    return;
                }
            }

            // --- Reset state and transition ---
            setFlashcardsGenerated(true);
            setCurrentFlashcardIndex(0);
            setSavedIndices(new Set());
            setSavedFlashcards([]);

            // Transition to viewer after short delay (simulate load time)
            setTimeout(() => {
            setStatus("");        // clear right before entering viewer
            setView("viewer");
            }, 1500); 

        } catch (err) {
            console.error("Unexpected error:", err);
            setStatus(`❌ Unexpected error: ${err.message}`);
            setView("form");
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

    const handleSaveAnswer = () => {
        handleAnswerChange(editedAnswer);
        setStatus("Saved ✓");
        setTimeout(() => setStatus(""), 1500); // clears after 1.5s
    };

    const handleUpdateAnswer = () => {
        handleAnswerChange(editedAnswer);
        setStatus("Updated ✓");
        setTimeout(() => setStatus(""), 1500); // clears after 1.5s
    };

    const handleDoneConfirmYes = async () => {
    setStatus("Saving deck...");
    try {
        //First we save the deck 
        const deckData = {
            ownerId: currentUser.uid,
            title: deckTitle.trim() || "Untitled Deck",
            description: deckDescription,
            createdAt: serverTimestamp(),
            isPublic: false,
            category: selectedCategory,
            collaborators: [],
            //we can add image stuff here when decided
            imagePath: "",

        };
        const deckDocRef = await addDoc(collection(db, "deck"), deckData);
        const newDeckId = deckDocRef.id;
        //Then we save the flashcards
        if (savedFlashcards.length > 0) {
            const flashcardPromises = savedFlashcards.map((card) => {
                const flashcardData = {
                    deckId: newDeckId,
                    ownerId: currentUser.uid,
                    front: card.front,
                    back: card.back,
                    createdAt: serverTimestamp(),
                    isPublic: false,
                    category: selectedCategory,
                    isMultipleChoice: !!card.isMultipleChoice,
                    //I will pul the stuff here for the image on the cards
                    imagePath: "",
                };
                return addDoc(collection(db, "flashcard"), flashcardData);
            });
            await Promise.all(flashcardPromises); // Execute all saves concurrently
        }
        console.log("Simulated deck save. Deck contents:", savedFlashcards);
        await new Promise((res) => setTimeout(res, 400));
        setShowDeckPrompt(false);
        setStatus("Deck saved successfully!");
        setView("status");
        setTimeout(() => {
            setStatus("");       // clear after showing
            setView("form");     // go back to start
        }, 3000);

        // Delay resetting UI so user sees the success message briefly
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
            setStartPage('1');
            setEndPage('1');
            setSelectedCategory("");
            setSelectedSubcategory("");
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            setView("form");
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
        setStartPage('1');
        setEndPage('1');
        setView("status")
        setStatus("⚠️Deck canceled and discarded.");
        setTimeout(() => {
            setStatus("");       // clear after showing
            setView("form");     // go back to start
        }, 3000);
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
            {/* Back Button (fixed route to Main Menu) */}
            <button
                type="button"
                className={styles.backBtn}
                onClick={() => navigate("/main")}
                >
                ← Back to Main Menu
            </button>
            <button onClick={() => navigate("/login")}>Go to Login</button>
        </div>
        );
    }

    return (
        <div className={styles.flashcardGenerator}>
            {/* Back Button */}
            {view === "form" || view === "viewer" ? (
                <button className={styles.backBtn} onClick={() => navigate("/main")}>
                    ← Back to Main Menu
                </button>
            ) : null}

            <h2>Flashcard Generator</h2>

            {/* --- STATUS VIEW (after cancel or finalize) --- */}
            {view === "status" && (
            <div className={styles.statusScreen}>
                <p className={styles.statusMessage}>{status}</p>
            </div>
            )}

            {/* --- FORM VIEW --- */}
            {view === "form" && (
                <form onSubmit={handleSubmit} className={styles.generatorForm}>
                    <label>
                        Enter Text Directly:
                        <textarea
                            value={textInput}
                            onChange={(e) => {
                                const value = e.target.value;
                                setTextInput(value);
                                setCharCount(value.length);
                            }}
                            placeholder="Enter or paste text here..."
                            className={styles.textInput}
                        />
                        <div className={styles.charCounter}>
                            Characters: {charCount.toLocaleString()}
                        </div>
                    </label>
                    <label className={styles.fileUploadLabel}>Upload File (PDF):</label>
                    <div className={styles.fileUploadWrapper}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={styles.uploadButton}
                        >
                            Choose File
                        </button>

                        {file ? (
                            <div className={styles.fileInfo}>
                            <span className={styles.fileName}>{file.name}</span>
                            <button
                                type="button"
                                className={styles.removeFileBtn}
                                onClick={() => {
                                setFile(null);
                                fileInputRef.current.value = "";
                                }}
                            >
                                ✖
                            </button>
                            </div>
                        ) : (
                            <span className={styles.fileName}>No file chosen</span>
                        )}

                        <input
                            type="file"
                            accept=".pdf"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className={styles.hiddenFileInput}
                        />
                    </div>

                    {file && (
                        <div className={styles.pageRangeContainer}>
                            <label htmlFor="startPage" className={styles.pageLabel}>Start Page</label>
                            <input
                            type="number"
                            id="startPage"
                            name="startPage"
                            className={styles.pageInput}
                            value={startPage}
                            onChange={(e) => setStartPage(e.target.value)}
                            min="1"
                            />

                            <label htmlFor="endPage" className={styles.pageLabelEndPageLabel}>End Page</label>
                            <input
                            type="number"
                            id="endPage"
                            name="endPage"
                            className={styles.pageInput}
                            value={endPage}
                            onChange={(e) => setEndPage(e.target.value)}
                            min="1"
                            />
                        </div>
                    )}

                    {/* AI Prompt */}
                    <label>
                        AI Prompt:
                        <textarea
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder="Enter your instructions for AI 
    For Example: 
        Generate 10 flashcards
        Only definitions
        Key Ideas
        Cause/Effect"
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
                </form>
            )}

            {/* --- LOADING VIEW --- */}
            {view === "loading" && (
                <div className={styles.loadingScreen}>
                    <div className={styles.loadingDots}>
                        <span></span><span></span><span></span>
                    </div>
                    <p className={styles.loadingText}>Generating flashcards...</p>
                    {status && <p className={styles.loadingStatus}>{status}</p>}
                </div>
            )}

            {/* --- VIEWER VIEW --- */}
            {view === "viewer" && (
                <div className={styles.viewerContainer}>
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
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                            {/* Use as Answer */}
                            <button
                                type="button"
                                className={styles.useAsAnswerBtn}
                                onClick={() => handleAnswerChange(currentFlashcard[1])}
                            >
                                Use as Answer
                            </button>

                                {/* Type selector */}
                                <select
                                    value={flashcardType}
                                    className={styles.typeBtn}
                                    onChange={(e) => setFlashcardType(e.target.value)}
                                >
                                    <option value="Short Response">Short Response</option>
                                    <option value="Multiple Choice">Multiple Choice</option>
                                </select>
                            </div>

                            <textarea
                                value={editedAnswer}
                                onChange={(e) => setEditedAnswer(e.target.value)}
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

                                <p className={styles.savedIndicator}>{status}</p>

                                <div className={styles.rightActions}>
                                <button
                                    type="button"
                                    disabled={isButtonLocked}
                                    onClick={() => {
                                        if (isButtonLocked) return; // ignore rapid clicks

                                        const [question, relevant] = currentFlashcard;
                                        const answer = editedAnswer.trim();

                                        // Determine if this card has already been saved before
                                        const isUpdating = savedIndices.has(currentFlashcardIndex);

                                        // Update userAnswers
                                        setUserAnswers((prev) => {
                                        const copy = [...prev];
                                        copy[currentFlashcardIndex] = answer;
                                        return copy;
                                        });

                                        // Update flashcardPairs to include isMultipleChoice flag while preserving existing shape
                                        setFlashcardPairs((prev) => {
                                            const updated = [...prev];
                                            const existing = updated[currentFlashcardIndex];
                                            if (existing && typeof existing === "object") {
                                                if (Array.isArray(existing)) {
                                                    existing.isMultipleChoice = flashcardType === "Multiple Choice";
                                                    updated[currentFlashcardIndex] = existing;
                                                } else {
                                                    updated[currentFlashcardIndex] = { ...existing, isMultipleChoice: flashcardType === "Multiple Choice" };
                                                }
                                            } else {
                                                updated[currentFlashcardIndex] = [question, relevant];
                                                updated[currentFlashcardIndex].isMultipleChoice = flashcardType === "Multiple Choice";
                                            }
                                            return updated;
                                        });

                                        // Update savedFlashcards list
                                        setSavedFlashcards((prev) => {
                                        const existingIdx = prev.findIndex((f) => f.index === currentFlashcardIndex);
                                        const cardData = {
                                            index: currentFlashcardIndex,
                                            front: question,
                                            back: answer,
                                            isMultipleChoice: flashcardType === "Multiple Choice",
                                        };

                                        if (existingIdx !== -1) {
                                            const copy = [...prev];
                                            copy[existingIdx] = cardData;
                                            return copy;
                                        } else {
                                            return [...prev, cardData];
                                        }
                                        });

                                        // Mark as saved
                                        setSavedIndices((prev) => new Set(prev).add(currentFlashcardIndex));

                                        // Call respective status handler
                                        if (isUpdating) {
                                        handleUpdateAnswer();
                                        } else {
                                        handleSaveAnswer();
                                        }
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
                        </div>
                        </div>
                    </div>
                    )}
                </div>
            )}

            {/* Deck title + description prompt */}
            {showDeckPrompt && (
            <div className={styles.modalOverlay} role="dialog" aria-modal="true">
                <div className={styles.modal}>
                <h3>Finalize Deck</h3>

                <label>
                    Deck Title: (required)
                    <input
                    type="text"
                    value={deckTitle}
                    onChange={(e) => setDeckTitle(e.target.value)}
                    placeholder="Enter a title for your deck"
                    />
                </label>

                {/* Category dropdown */}
                <label>
                    Category (required):
                    <select
                    value={selectedCategory}
                    onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setSelectedSubcategory(""); // reset subcategory on main category change
                    }}
                    required
                    >
                    <option value="">--Select Category--</option>
                    {categories.map((cat) => (
                        <option key={cat.name} value={cat.name}>
                        {cat.name}
                        </option>
                    ))}
                    </select>
                </label>

                {/* Subcategory dropdown */}
                <label>
                    Subcategory (optional):
                    <select
                    value={selectedSubcategory}
                    onChange={(e) => setSelectedSubcategory(e.target.value)}
                    >
                    <option value="">--Select Subcategory--</option>
                    {categories
                        .find((cat) => cat.name === selectedCategory)
                        ?.subcategories.map((sub) => (
                        <option key={sub} value={sub}>
                            {sub}
                        </option>
                        ))}
                    </select>
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
                        if (!selectedCategory) {
                        alert("Please select a category.");
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



           {/* -------------------- Study Mode Section -------------------- */}
            <div className={styles.studySection}>
                <button
                    onClick={async () => {
                        if (!isStudying) {
                        try {
                            setStatus("Fetching study flashcards...");

                            const response = await fetch("/study", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ flashcards: dummyFlashcards }),
                            });

                            if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            const message = errorData.error || "Unknown error from server.";
                            console.error("Study API error:", message);
                            setStatus(`${message}`);
                            return;
                            }

                            const data = await response.json();

                            if (!data.output || !Array.isArray(data.output)) {
                            setStatus("No valid study flashcards returned.");
                            console.error("No output:", data);
                            return;
                            }

                            // Build new array: [question, response, isMultipleChoice]
                            const processedFlashcards = dummyFlashcards.map((fc, idx) => [
                            fc.question,
                            data.output[idx] || "", // fallback in case server output is shorter
                            fc.isMultipleChoice,
                            ]);

                            console.log("📘 Processed flashcards:", processedFlashcards);
                            setStatus(`Study flashcards received: ${processedFlashcards.length}`);
                        } catch (err) {
                            console.error("Error calling /study:", err);
                            setStatus(`Unexpected error: ${err.message}`);
                        }
                        }

                        setIsStudying(!isStudying);
                    }}
                    className={styles.studyButton}
                    >
                    {isStudying ? "Hide Study Box" : "Start Studying (Dummy Data)"}
                </button>

                {isStudying && (
                    <div className={styles.studyBox}>
                        <p>Study mode started! (Dummy flashcards loaded)</p>
                    </div>
                )}
            </div>
            {/* ------------------------------------------------------------- */}

        </div>
    );
}




export default FlashcardGenerator;
