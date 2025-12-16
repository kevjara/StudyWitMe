import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import styles from "./FlashcardGenerator.module.css";
import { categories } from "./categories";
import ImagePicker from "./ImagePicker";
import ModalPortal from "./ModalPortal";

function FlashcardGenerator() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    // Input + generation
    const [textInput, setTextInput] = useState("");
    const [file, setFile] = useState(null);
    const [aiPrompt, setAiPrompt] = useState("");
    const [charCount, setCharCount] = useState(0);
    const [startPage, setStartPage] = useState("1");
    const [endPage, setEndPage] = useState("1");
    const [view, setView] = useState("form"); // "form" | "loading" | "viewer"

    // Generated flashcards
    const [flashcardPairs, setFlashcardPairs] = useState([]); // [question, relevantText]
    const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
    const [flashcardTypes, setFlashcardTypes] = useState([]); // per index type
    const [userAnswers, setUserAnswers] = useState([]); // per index answer text
    const [editedAnswer, setEditedAnswer] = useState("");
    const [savedFlashcards, setSavedFlashcards] = useState([]); // { index, front, back, type, imagePath, pixabayId }
    const [savedIndices, setSavedIndices] = useState(new Set());
    const [flashcardsGenerated, setFlashcardsGenerated] = useState(false);

    // Deck metadata
    const [showDeckPrompt, setShowDeckPrompt] = useState(false);
    const [deckTitle, setDeckTitle] = useState("");
    const [deckDescription, setDeckDescription] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSubcategory, setSelectedSubcategory] = useState("");
    const [isPublic, setIsPublic] = useState(false);
    const [isFinishLocked, setIsFinishLocked] = useState(false);

    // Deck & card images (Pixabay-backed)
    const [deckImagePath, setDeckImagePath] = useState("");
    const [deckPixabayId, setDeckPixabayId] = useState(null);
    const [cardImagePaths, setCardImagePaths] = useState([]); // index -> URL
    const [cardPixabayIds, setCardPixabayIds] = useState([]); // index -> pixabayId

    // UI helpers
    const [status, setStatus] = useState("");
    const [isButtonLocked, setIsButtonLocked] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [pickerForDeck, setPickerForDeck] = useState(false);
    const [pickerForCard, setPickerForCard] = useState(null); // index or null

    const statusTimeoutRef = useRef(null);
    const fileInputRef = useRef(null);

    const currentFlashcard =
        flashcardPairs.length > 0 ? flashcardPairs[currentFlashcardIndex] : null;

    useEffect(() => {
        return () => {
            if (statusTimeoutRef.current) {
                clearTimeout(statusTimeoutRef.current);
            }
        };
    }, []);

    const showStatus = (message, duration = 3000) => {
        if (statusTimeoutRef.current) {
            clearTimeout(statusTimeoutRef.current);
        }
        setStatus(message);
        statusTimeoutRef.current = setTimeout(() => {
            setStatus("");
            statusTimeoutRef.current = null;
        }, duration);
    };

    const resetAll = () => {
        setTextInput("");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setAiPrompt("");
        setCharCount(0);
        setStartPage("1");
        setEndPage("1");
        setFlashcardPairs([]);
        setCurrentFlashcardIndex(0);
        setFlashcardTypes([]);
        setUserAnswers([]);
        setEditedAnswer("");
        setSavedFlashcards([]);
        setSavedIndices(new Set());
        setFlashcardsGenerated(false);

        setDeckTitle("");
        setDeckDescription("");
        setSelectedCategory("");
        setSelectedSubcategory("");
        setIsPublic(false);
        setDeckImagePath("");
        setDeckPixabayId(null);
        setCardImagePaths([]);
        setCardPixabayIds([]);
        setShowDeckPrompt(false);
        setShowCancelConfirm(false);
        setView("form");
    };

    const handleTextChange = (e) => {
        const value = e.target.value;
        setTextInput(value);
        setCharCount(value.length);
    };

    const handleFileChange = (e) => {
        const selected = e.target.files && e.target.files[0] ? e.target.files[0] : null;
        setFile(selected);
    };

    const handleRemoveFile = () => {
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!currentUser) {
            showStatus("Please sign in to generate flashcards.", 4000);
            return;
        }

        if (!textInput.trim() && !file) {
            showStatus("Enter text or upload a PDF to generate.", 4000);
            return;
        }

        setView("loading");

        try {
            let response;

            if (file) {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("instructions", aiPrompt || "");
                formData.append("startPage", startPage || "1");
                formData.append("endPage", endPage || startPage || "1");

                response = await fetch("/generate", {
                    method: "POST",
                    body: formData,
                });
            } else {
                response = await fetch("/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        input: textInput,
                        instructions: aiPrompt || "",
                    }),
                });
            }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to generate flashcards.");
            }

            let data = await response.json().catch(() => null);
            let output = data && data.output !== undefined ? data.output : data;

            if (typeof output === "string") {
                try {
                    output = JSON.parse(output);
                } catch {
                    // leave as is
                }
            }

            if (!Array.isArray(output)) {
                throw new Error("Unexpected response format from generator.");
            }

            const pairs = output
                .map((item) => {
                    if (Array.isArray(item) && item.length >= 2) {
                        return [item[0], item[1]];
                    }
                    if (item && typeof item === "object") {
                        const q = item.question || item.front || "";
                        const r = item.relevantText || item.back || "";
                        if (!q && !r) return null;
                        return [q, r];
                    }
                    return null;
                })
                .filter(Boolean);

            if (!pairs.length) {
                throw new Error("Generator returned no usable flashcards.");
            }

            setFlashcardPairs(pairs);
            setFlashcardsGenerated(true);
            setCurrentFlashcardIndex(0);
            setFlashcardTypes(new Array(pairs.length).fill("Multiple Choice"));
            setUserAnswers(new Array(pairs.length).fill(""));
            setSavedFlashcards([]);
            setSavedIndices(new Set());
            setEditedAnswer(pairs[0][1] || "");
            setView("viewer");
            showStatus(`Generated ${pairs.length} flashcards.`, 3000);
        } catch (err) {
            console.error("Generate error:", err);
            setView("form");
            showStatus(err.message || "Error generating flashcards.", 4000);
        }
    };

    const handlePrev = () => {
        if (currentFlashcardIndex === 0 || flashcardPairs.length === 0) return;
        const newIndex = currentFlashcardIndex - 1;
        setCurrentFlashcardIndex(newIndex);

        const saved = savedFlashcards.find((c) => c.index === newIndex);
        const fallback =
            userAnswers[newIndex] ||
            (flashcardPairs[newIndex] ? flashcardPairs[newIndex][1] : "");
        setEditedAnswer(saved?.back ?? fallback ?? "");
    };

    const handleNext = () => {
        if (
            flashcardPairs.length === 0 ||
            currentFlashcardIndex === flashcardPairs.length - 1
        ) {
            return;
        }
        const newIndex = currentFlashcardIndex + 1;
        setCurrentFlashcardIndex(newIndex);

        const saved = savedFlashcards.find((c) => c.index === newIndex);
        const fallback =
            userAnswers[newIndex] ||
            (flashcardPairs[newIndex] ? flashcardPairs[newIndex][1] : "");
        setEditedAnswer(saved?.back ?? fallback ?? "");
    };

    const handleAnswerChange = (value) => {
        setEditedAnswer(value);
        setUserAnswers((prev) => {
            const copy = [...prev];
            copy[currentFlashcardIndex] = value;
            return copy;
        });
    };

    const handleTypeChange = (newType) => {
        setFlashcardTypes((prev) => {
            const copy = [...prev];
            copy[currentFlashcardIndex] = newType;
            return copy;
        });
    };

    const handleSaveAnswer = () => {
        showStatus("Flashcard saved to deck preview.", 2500);
    };

    const handleUpdateAnswer = () => {
        showStatus("Flashcard updated in deck preview.", 2500);
    };

    const handleCancelClick = () => {
        if (!flashcardsGenerated && savedFlashcards.length === 0) {
            resetAll();
            return;
        }
        setShowCancelConfirm(true);
    };

    const handleCancelConfirmYes = () => {
        resetAll();
    };

    const handleCancelConfirmNo = () => {
        setShowCancelConfirm(false);
    };

    const handleDoneConfirmYes = async () => {
        if (!currentUser) {
            alert("Please sign in to save decks.");
            return;
        }
        if (!deckTitle.trim()) {
            alert("Please enter a deck title.");
            return;
        }
        if (!selectedCategory) {
            alert("Please select a category.");
            return;
        }
        if (savedFlashcards.length === 0) {
            alert("Save at least one flashcard before finishing.");
            return;
        }

        setIsFinishLocked(true);

        try {
            const deckRef = await addDoc(collection(db, "deck"), {
                ownerId: currentUser.uid,
                title: deckTitle.trim(),
                description: deckDescription.trim(),
                category: selectedCategory,
                subCategory: selectedSubcategory || "",
                isPublic,
                imagePath: deckImagePath || null,
                pixabayId: deckPixabayId || null,
                createdAt: serverTimestamp(),
            });

            const flashRef = collection(db, "flashcard");
            const promises = savedFlashcards.map((card) =>
                addDoc(flashRef, {
                    deckId: deckRef.id,
                    ownerId: currentUser.uid,
                    front: card.front,
                    back: card.back,
                    type: card.type,
                    imagePath: card.imagePath || null,
                    pixabayId: card.pixabayId || null,
                    category: selectedCategory,
                    isPublic,
                    createdAt: serverTimestamp(),
                })
            );

            await Promise.all(promises);

            showStatus("Deck saved!", 3500);
            resetAll();
            navigate(`/flashcards/deck/${deckRef.id}/manage`);
        } catch (err) {
            console.error("Error saving deck:", err);
            alert("Failed to save deck. Please try again.");
        } finally {
            setIsFinishLocked(false);
        }
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.container}>
                {/* FORM VIEW */}
                {view === "form" && (
                    <form className={styles.form} onSubmit={handleSubmit}>
                        <h2 className={styles.heading}>AI Flashcard Generator</h2>

                        <label className={styles.label}>
                            Paste Text
                            <textarea
                                value={textInput}
                                onChange={handleTextChange}
                                placeholder="Paste your notes, lecture transcript, or article text here..."
                                className={styles.textarea}
                            />
                            <span className={styles.charCount}>{charCount} characters</span>
                        </label>

                        <div className={styles.row}>
                            <div className={styles.fileColumn}>
                                <label className={styles.label}>PDF (optional)</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="application/pdf"
                                    onChange={handleFileChange}
                                />
                                {file && (
                                    <button
                                        type="button"
                                        className={styles.removeFileBtn}
                                        onClick={handleRemoveFile}
                                    >
                                        Remove PDF ({file.name})
                                    </button>
                                )}
                            </div>

                            <div className={styles.pageColumn}>
                                <label className={styles.label}>Start Page</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={startPage}
                                    onChange={(e) => setStartPage(e.target.value)}
                                />
                                <label className={styles.label}>End Page</label>
                                <input
                                    type="number"
                                    min={startPage || "1"}
                                    value={endPage}
                                    onChange={(e) => setEndPage(e.target.value)}
                                />
                            </div>
                        </div>

                        <label className={styles.label}>
                            Extra Instructions (optional)
                            <textarea
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="E.g., focus on key definitions, make questions exam-style, include simple examples..."
                                className={styles.textarea}
                            />
                        </label>

                        <div className={styles.actionsRow}>
                            <button type="submit" className={styles.generateBtn}>
                                Generate Flashcards
                            </button>
                            {status && <span className={styles.statusPill}>{status}</span>}
                        </div>
                    </form>
                )}

                {/* LOADING VIEW */}
                {view === "loading" && (
                    <div className={styles.loadingView}>
                        <p>Generating flashcards with AIthis can take a moment...</p>
                    </div>
                )}

                {/* VIEWER VIEW */}
                {view === "viewer" && currentFlashcard && (
                    <div className={styles.viewerContainer}>
                        {!showDeckPrompt && (
                            <div className={styles.flashcardViewer}>
                                <div className={styles.viewerTopBar}>
                                    <div className={styles.flashcardStatusBar}>
                                        <span className={styles.flashcardCounter}>
                                            Flashcard {currentFlashcardIndex + 1} / {" "}
                                            {flashcardPairs.length}
                                        </span>

                                        {savedIndices.has(currentFlashcardIndex) && (
                                            <span className={styles.savedStatus}>
                                                Saved in Deck f
                                            </span>
                                        )}

                                        <span className={styles.deckSize}>
                                            Deck Size: {savedFlashcards.length} Flashcards Saved
                                        </span>
                                    </div>

                                    <button
                                        className={styles.cancelBtn}
                                        type="button"
                                        onClick={handleCancelClick}
                                    >
                                        Cancel
                                    </button>
                                </div>

                                <div className={styles.viewerInner}>
                                    <div className={styles.viewerContent}>
                                        <p>
                                            <strong>Q:</strong> {currentFlashcard[0]}
                                        </p>
                                        <p>
                                            <strong>Relevant:</strong> {currentFlashcard[1]}
                                        </p>

                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                marginTop: "8px",
                                            }}
                                        >
                                            <button
                                                type="button"
                                                className={styles.useAsAnswerBtn}
                                                onClick={() =>
                                                    handleAnswerChange(currentFlashcard[1] || "")
                                                }
                                            >
                                                Use as Answer
                                            </button>

                                            <select
                                                value={
                                                    flashcardTypes[currentFlashcardIndex] ||
                                                    "Multiple Choice"
                                                }
                                                className={styles.typeBtn}
                                                onChange={(e) =>
                                                    handleTypeChange(e.target.value)
                                                }
                                            >
                                                <option value="Short Response">
                                                    Short Response
                                                </option>
                                                <option value="Multiple Choice">
                                                    Multiple Choice
                                                </option>
                                            </select>
                                        </div>

                                        <textarea
                                            value={editedAnswer}
                                            onChange={(e) =>
                                                handleAnswerChange(e.target.value)
                                            }
                                            placeholder="Your Answer..."
                                        />

                                        {/* Card Image Controls (Pixabay-backed) */}
                                        {cardImagePaths[currentFlashcardIndex] ? (
                                            <div
                                                style={{
                                                    marginTop: "10px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "10px",
                                                }}
                                            >
                                                <img
                                                    src={cardImagePaths[currentFlashcardIndex]}
                                                    alt="Card Preview"
                                                    style={{
                                                        width: "80px",
                                                        height: "80px",
                                                        objectFit: "cover",
                                                        borderRadius: "6px",
                                                    }}
                                                />
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: "5px",
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        className={styles.uploadButton}
                                                        onClick={() =>
                                                            setPickerForCard(
                                                                currentFlashcardIndex
                                                            )
                                                        }
                                                        style={{
                                                            width: "150px",
                                                            padding: "5px",
                                                        }}
                                                    >
                                                        Change Image
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.uploadButton}
                                                        onClick={() => {
                                                            setCardImagePaths((prev) => {
                                                                const copy = [...prev];
                                                                copy[currentFlashcardIndex] =
                                                                    "";
                                                                return copy;
                                                            });
                                                            setCardPixabayIds((prev) => {
                                                                const copy = [...prev];
                                                                copy[currentFlashcardIndex] =
                                                                    null;
                                                                return copy;
                                                            });
                                                        }}
                                                        style={{
                                                            width: "150px",
                                                            padding: "5px",
                                                        }}
                                                    >
                                                        Remove Image
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: "10px" }}>
                                                <button
                                                    type="button"
                                                    className={styles.uploadButton}
                                                    onClick={() =>
                                                        setPickerForCard(
                                                            currentFlashcardIndex
                                                        )
                                                    }
                                                    style={{ padding: "8px 14px" }}
                                                >
                                                    Add Card Image
                                                </button>
                                            </div>
                                        )}

                                        <div className={styles.flashcardActions}>
                                            <div className={styles.leftActions}>
                                                <button
                                                    type="button"
                                                    onClick={handlePrev}
                                                >
                                                    &lt; Prev
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleNext}
                                                >
                                                    Next &gt;
                                                </button>
                                            </div>

                                            <p className={styles.savedIndicator}>{status}</p>

                                            <div className={styles.rightActions}>
                                                <button
                                                    type="button"
                                                    disabled={isButtonLocked}
                                                    onClick={() => {
                                                        if (isButtonLocked) return;

                                                        const [question, relevant] =
                                                            currentFlashcard;
                                                        const answer =
                                                            editedAnswer.trim() ||
                                                            (relevant || "");

                                                        const currentCardImagePath =
                                                            cardImagePaths[
                                                                currentFlashcardIndex
                                                            ] || "";
                                                        const currentCardPixabayId =
                                                            cardPixabayIds[
                                                                currentFlashcardIndex
                                                            ] || null;

                                                        const isUpdating =
                                                            savedIndices.has(
                                                                currentFlashcardIndex
                                                            );

                                                        setIsButtonLocked(true);

                                                        setSavedFlashcards((prev) => {
                                                            const existingIdx =
                                                                prev.findIndex(
                                                                    (f) =>
                                                                        f.index ===
                                                                        currentFlashcardIndex
                                                                );

                                                            const cardData = {
                                                                index: currentFlashcardIndex,
                                                                front: question,
                                                                back: answer,
                                                                type:
                                                                    flashcardTypes[
                                                                        currentFlashcardIndex
                                                                    ] ||
                                                                    "Multiple Choice",
                                                                imagePath:
                                                                    currentCardImagePath,
                                                                pixabayId:
                                                                    currentCardPixabayId,
                                                            };

                                                            if (existingIdx !== -1) {
                                                                const copy = [...prev];
                                                                copy[existingIdx] = cardData;
                                                                return copy;
                                                            }
                                                            return [...prev, cardData];
                                                        });

                                                        setSavedIndices((prev) => {
                                                            const ns = new Set(prev);
                                                            ns.add(currentFlashcardIndex);
                                                            return ns;
                                                        });

                                                        if (isUpdating) {
                                                            handleUpdateAnswer();
                                                        } else {
                                                            handleSaveAnswer();
                                                        }

                                                        setTimeout(() => {
                                                            setIsButtonLocked(false);
                                                        }, 500);
                                                    }}
                                                >
                                                    {savedIndices.has(
                                                        currentFlashcardIndex
                                                    )
                                                        ? "Update"
                                                        : "Save"}
                                                </button>

                                                {savedIndices.has(
                                                    currentFlashcardIndex
                                                ) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSavedFlashcards((prev) =>
                                                                prev.filter(
                                                                    (card) =>
                                                                        card.index !==
                                                                        currentFlashcardIndex
                                                                )
                                                            );
                                                            setSavedIndices((prev) => {
                                                                const ns = new Set(prev);
                                                                ns.delete(
                                                                    currentFlashcardIndex
                                                                );
                                                                return ns;
                                                            });
                                                            showStatus(
                                                                "Removed flashcard from deck.",
                                                                2500
                                                            );
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

                {/* Finalize Deck Modal */}
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

                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    marginBottom: "15px",
                                }}
                            >
                                <input
                                    type="checkbox"
                                    id="isPublicCheck"
                                    checked={isPublic}
                                    onChange={(e) => setIsPublic(e.target.checked)}
                                    style={{ width: "auto", margin: 0 }}
                                />
                                <label
                                    htmlFor="isPublicCheck"
                                    style={{ fontWeight: 500, margin: 0 }}
                                >
                                    Make Deck Public
                                </label>
                            </div>

                            {/* Deck Image Controls */}
                            <div style={{ marginBottom: "15px" }}>
                                {deckImagePath ? (
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "10px",
                                        }}
                                    >
                                        <img
                                            src={deckImagePath}
                                            alt="Deck Preview"
                                            style={{
                                                width: "80px",
                                                height: "80px",
                                                objectFit: "cover",
                                                borderRadius: "6px",
                                            }}
                                        />
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "5px",
                                            }}
                                        >
                                            <button
                                                type="button"
                                                className={styles.uploadButton}
                                                onClick={() => setPickerForDeck(true)}
                                                style={{ width: "150px", padding: "5px" }}
                                            >
                                                Change Deck Image
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDeckImagePath("");
                                                    setDeckPixabayId(null);
                                                }}
                                                className={styles.removeFileBtn}
                                                style={{
                                                    color: "#e74c3c",
                                                    padding: "5px",
                                                    background: "none",
                                                    border: "none",
                                                    textAlign: "left",
                                                    cursor: "pointer",
                                                    width: "150px",
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.uploadButton}
                                        onClick={() => setPickerForDeck(true)}
                                        style={{ width: "100%", padding: "10px" }}
                                    >
                                        Add Deck Cover Image
                                    </button>
                                )}
                            </div>

                            <label>
                                Category (required):
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => {
                                        setSelectedCategory(e.target.value);
                                        setSelectedSubcategory("");
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
                                    onChange={(e) =>
                                        setDeckDescription(e.target.value)
                                    }
                                    placeholder="Enter a short description (optional)"
                                />
                            </label>

                            <div className={styles.modalActions}>
                                <button
                                    disabled={isFinishLocked}
                                    onClick={handleDoneConfirmYes}
                                >
                                    Finish
                                </button>
                                <button onClick={() => setShowDeckPrompt(false)}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Deck Image Picker */}
                {pickerForDeck && (
                    <ModalPortal>
                        <div className={styles.modalOverlay}>
                            <div
                                className={styles.modal}
                                style={{
                                    maxWidth: "800px",
                                    height: "80vh",
                                    top: "50%",
                                    transform: "translate(-50%, -50%)",
                                }}
                            >
                                <ImagePicker
                                    mode="inline"
                                    open
                                    onClose={() => setPickerForDeck(false)}
                                    onSelect={(img) => {
                                        setDeckImagePath(img?.webformatURL || "");
                                        setDeckPixabayId(img?.id || null);
                                        setPickerForDeck(false);
                                    }}
                                />
                            </div>
                        </div>
                    </ModalPortal>
                )}

                {/* Card Image Picker */}
                {pickerForCard !== null && (
                    <ModalPortal>
                        <div className={styles.modalOverlay}>
                            <div
                                className={styles.modal}
                                style={{
                                    maxWidth: "800px",
                                    height: "80vh",
                                    top: "50%",
                                    transform: "translate(-50%, -50%)",
                                }}
                            >
                                <ImagePicker
                                    mode="inline"
                                    open
                                    onClose={() => setPickerForCard(null)}
                                    onSelect={(img) => {
                                        const url = img?.webformatURL || "";
                                        const id = img?.id || null;
                                        setCardImagePaths((prev) => {
                                            const copy = [...prev];
                                            copy[pickerForCard] = url;
                                            return copy;
                                        });
                                        setCardPixabayIds((prev) => {
                                            const copy = [...prev];
                                            copy[pickerForCard] = id;
                                            return copy;
                                        });
                                        setPickerForCard(null);
                                    }}
                                />
                            </div>
                        </div>
                    </ModalPortal>
                )}

                {/* Cancel confirmation modal */}
                {showCancelConfirm && (
                    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
                        <div className={styles.modal}>
                            <p>Are you sure? All flashcards will be lost.</p>
                            <div className={styles.modalActions}>
                                <button onClick={handleCancelConfirmYes}>Yes</button>
                                <button onClick={handleCancelConfirmNo}>
                                    Never mind
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default FlashcardGenerator;