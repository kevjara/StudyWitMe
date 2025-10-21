import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRef, useEffect } from "react";
import { db } from "../services/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import styles from "./FlashcardGenerator.module.css";
import { categories } from "./categories";
import ImagePicker from "./ImagePicker";

function FlashcardGenerator() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    //this is the stuff for the imagepicker/pixa
    const [pickerOpen, setPickerOpen] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);

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
    const [startPage, setStartPage] = useState(''); //starPage button
    const [endPage, setEndPage] = useState(''); //endPage button
    //Used in Finalize Deck
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSubcategory, setSelectedSubcategory] = useState("");

    // UI modals
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    const MAX_CHARACTERS = 3_500_000;
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
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
        } else {
            // If the user canceled, do nothing — keep the existing file
            e.target.value = ""; // reset the input’s value safely
        }
    };

    // Generate flashcards (called on form submit)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (flashcardsGenerated) return;

        setStatus("Processing...");
        setFlashcardPairs([]);
        setSavedFlashcards([]);
        setCurrentFlashcardIndex(0);

        try {
            let response;

            if (file) {
                // PDF upload with FormData
                const formData = new FormData();
                formData.append("pdf", file);
                const startPage = 1; // Optional: add inputs for this later
                const endPage = 5;   // Example range
                formData.append("startPage", startPage);
                formData.append("endPage", endPage);
                formData.append("instructions", aiPrompt);
                formData.append("startPage", startPage);
                formData.append("endPage", endPage);

                response = await fetch("/generate", { method: "POST", body: formData });
            } else {
                const textToSend = textInput.trim();
                if (!textToSend) {
                    setStatus("Please enter some text or upload a file.");
                    return;
                }
                if (textToSend.length > MAX_CHARACTERS) {
                    setStatus(`Text too long (${textToSend.length} chars). Please shorten it.`);
                    return;
                }

                response = await fetch("/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        input: textToSend,
                        instructions: aiPrompt,
                    }),
                });
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                setStatus(`Error: ${errorData.error || "Unknown error"}`);
                return;
            }

            const data = await response.json();

            if (!data.output) {
                setStatus("No flashcards returned.");
                return;
            }

            let output = data.output;

            // Case 1: already parsed array
            if (Array.isArray(output)) {
                const pairs = output.map(f => [f.question, f.relevantText]);
                setFlashcardPairs(pairs);
                setStatus(`Loaded ${pairs.length} flashcards`);
            } else {
                // Case 2: raw text JSON
                let cleanOutput = output.trim();
                if (cleanOutput.startsWith("```")) {
                    cleanOutput = cleanOutput.replace(/^```(json)?/, '').replace(/```$/, '').trim();
                }

                try {
                    const parsed = JSON.parse(cleanOutput);
                    const pairs = parsed.map(f => [f.question, f.relevantText]);
                    setFlashcardPairs(pairs);
                    setStatus(`Loaded ${pairs.length} flashcards`);
                } catch (err) {
                    console.error("Failed to parse backend output:", cleanOutput, err);
                    setStatus("Error: Could not parse backend output. Check console.");
                    return;
                }
            }

            setFlashcardsGenerated(true);
            setCurrentFlashcardIndex(0);
            setSavedIndices(new Set());
            setSavedFlashcards([]);

        } catch (err) {
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
                imageUrl: selectedImage?.webformatURL || null,
                imageAttribution: selectedImage
                    ? { pageURL: selectedImage.pageURL, user: selectedImage.user }
                    : null,

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
                        //I will pul the stuff here for the image on the cards
                        imagePath: "",
                    };
                    return addDoc(collection(db, "flashcard"), flashcardData);
                });
                await Promise.all(flashcardPromises); // Execute all saves concurrently
            }
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
                setSelectedImage(null);
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
                        onChange={(e) => {
                            const value = e.target.value;
                            setTextInput(value);
                            setCharCount(value.length);
                        }}
                        placeholder="Enter or paste text here..."
                        className={styles.textInput}
                    />

                    {/* Character Counter */}
                    <div className={styles.charCounter}>
                        Characters: {charCount.toLocaleString()}
                    </div>
                </label>

                {/* File Upload */}
                <label className={styles.fileUploadLabel}>
                    Upload File (PDF):
                </label>
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

                {/* Deck title + description prompt +added pixaBay stuff */}
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

                            {/* PIxabay deck image (optional for users) */}
                            <label>
                                Deck Image (optional):
                                <div className={styles.fileUploadWrapper} style={{ gap: 12, marginTop: 8 }}>
                                    <button
                                        type="button"
                                        className={styles.uploadButton}
                                        onClick={() => setPickerOpen(true)}
                                    >
                                        Browse Pixabay
                                    </button>

                                    {selectedImage ? (
                                        <>
                                            <img
                                                src={selectedImage.previewURL || selectedImage.webformatURL}
                                                alt="selected"
                                                style={{ height: 44, borderRadius: 6, border: "1px solid #ccc" }}
                                            />
                                            <button
                                                type="button"
                                                className={styles.removeFileBtn}
                                                title="Remove"
                                                onClick={() => setSelectedImage(null)}
                                            >
                                                ✕
                                            </button>
                                        </>
                                    ) : (
                                        <span className={styles.fileName}>No image selected</span>
                                    )}
                                </div>
                                {pickerOpen && (
                                    <div style={{ marginTop: 12 }}>
                                        <ImagePicker
                                            mode="inline"
                                            open={pickerOpen}
                                            onClose={() => setPickerOpen(false)}
                                            onSelect={(img) => {
                                                setSelectedImage(img);
                                                setPickerOpen(false);
                                            }}
                                        />
                                    </div>
                                )}
                                {selectedImage && (
                                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                                        Photo by <strong>{selectedImage.user}</strong> on Pixabay
                                    </div>
                                )}
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