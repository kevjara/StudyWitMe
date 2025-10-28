import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import styles from "./FlashcardGenerator.module.css";
import { categories } from "./categories";
import ImagePicker from "./ImagePicker";

function FlashcardGenerator() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Pixabay image picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  // Inputs / state
  const [textInput, setTextInput] = useState("");
  const [file, setFile] = useState(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [status, setStatus] = useState("");
  const statusTimeoutRef = useRef(null);

  // Generated flashcards
  const [flashcardPairs, setFlashcardPairs] = useState([]); // [question, relevantText]
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [savedFlashcards, setSavedFlashcards] = useState([]); // { index, front, back, type }
  const [savedIndices, setSavedIndices] = useState(new Set());
  const [flashcardsGenerated, setFlashcardsGenerated] = useState(false);

  // Per-card answer + type
  const [userAnswers, setUserAnswers] = useState([]); // per-card answers
  const [editedAnswer, setEditedAnswer] = useState("");
  const [flashcardTypes, setFlashcardTypes] = useState([]); // per-card types
  const [isButtonLocked, setIsButtonLocked] = useState(false);

  // Deck finalize
  const [showDeckPrompt, setShowDeckPrompt] = useState(false);
  const [deckTitle, setDeckTitle] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [isFinishLocked, setIsFinishLocked] = useState(false);

  // UI view + misc
  const [view, setView] = useState("form"); // "form" | "loading" | "viewer" | "status"
  const fileInputRef = useRef(null);
  const [charCount, setCharCount] = useState(0);
  const [startPage, setStartPage] = useState("1");
  const [endPage, setEndPage] = useState("1");
  const bottomRef = useRef(null);

  const MAX_CHARACTERS = 3_500_000;

  // When switching cards, load saved answer
  useEffect(() => {
    const saved = userAnswers[currentFlashcardIndex] || "";
    setEditedAnswer(saved);
  }, [currentFlashcardIndex, userAnswers]);

  // When switching cards, load saved type if present
  useEffect(() => {
    const savedCard = savedFlashcards.find(
      (c) => c.index === currentFlashcardIndex
    );
    if (savedCard) {
      setFlashcardTypes((prev) => {
        const copy = [...prev];
        copy[currentFlashcardIndex] = savedCard.type || "Short Response";
        return copy;
      });
    }
  }, [currentFlashcardIndex, savedFlashcards]);

  // Optional: keep UI scrolled to bottom on certain changes
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [flashcardPairs, currentFlashcardIndex]);

  // Centralized status with auto-clear
  function showStatus(message, duration = 3000) {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    setStatus(message);
    statusTimeoutRef.current = setTimeout(() => {
      setStatus("");
      statusTimeoutRef.current = null;
    }, duration);
  }

  // File upload
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) setFile(selectedFile);
    else e.target.value = "";
  };

  // Per-card type change
  const handleTypeChange = (value) => {
    setFlashcardTypes((prev) => {
      const copy = [...prev];
      copy[currentFlashcardIndex] = value;
      return copy;
    });
  };

  // Generate flashcards
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (flashcardsGenerated) return;

    setFlashcardPairs([]);
    setSavedFlashcards([]);
    setCurrentFlashcardIndex(0);

    try {
      let response;

      if (file) {
        const formData = new FormData();
        formData.append("pdf", file);

        const start = parseInt(startPage, 10);
        const end = parseInt(endPage, 10);
        if (isNaN(start) || isNaN(end) || start > end) {
          showStatus("Invalid page range.");
          return;
        }

        formData.append("startPage", start);
        formData.append("endPage", end);
        formData.append("instructions", aiPrompt);

        setView("loading");
        response = await fetch("/generate", { method: "POST", body: formData });
      } else {
        const textToSend = textInput.trim();
        if (!textToSend) {
          showStatus("Please enter some text or upload a file.");
          return;
        }
        if (textToSend.length > MAX_CHARACTERS) {
          showStatus(`Text too long (${textToSend.length} chars). Please shorten it.`);
          return;
        }

        setView("loading");
        response = await fetch("/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: textToSend, instructions: aiPrompt }),
        });
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        showStatus(`❌ ${err.error || "Unknown error from server."}`);
        setView("form");
        return;
      }

      const data = await response.json();
      if (!data.output) {
        showStatus("No flashcards returned.");
        setView("form");
        return;
      }

      let output = data.output;

      if (Array.isArray(output)) {
        const pairs = output.map((f) => [f.question, f.relevantText]);
        setFlashcardPairs(pairs);
        showStatus(`✅ Generated ${pairs.length} flashcards`);
      } else {
        let clean = String(output).trim();
        if (clean.startsWith("```")) {
          clean = clean.replace(/^```(json)?/, "").replace(/```$/, "").trim();
        }
        try {
          const parsed = JSON.parse(clean);
          const pairs = parsed.map((f) => [f.question, f.relevantText]);
          setFlashcardPairs(pairs);
          showStatus(`✅ Generated ${pairs.length} flashcards`);
        } catch (err) {
          console.error("Failed to parse backend output:", clean, err);
          showStatus("❌ Error: Could not parse backend output. Check console.");
          setView("form");
          return;
        }
      }

      // Reset/transition to viewer
      setFlashcardsGenerated(true);
      setCurrentFlashcardIndex(0);
      setSavedIndices(new Set());
      setSavedFlashcards([]);

      setTimeout(() => {
        setStatus("");
        setView("viewer");
      }, 1500);
    } catch (err) {
      console.error("Unexpected error:", err);
      showStatus(`❌ Unexpected error: ${err.message}`);
      setView("form");
    }
  };

  // Navigation
  const handlePrev = () =>
    setCurrentFlashcardIndex((i) => Math.max(0, i - 1));
  const handleNext = () =>
    setCurrentFlashcardIndex((i) =>
      Math.min(flashcardPairs.length - 1, i + 1)
    );

  // Answers
  const handleAnswerChange = (value) => {
    setUserAnswers((prev) => {
      const copy = [...prev];
      copy[currentFlashcardIndex] = value;
      return copy;
    });
  };

  const handleSaveAnswer = () => {
    handleAnswerChange(editedAnswer);
    showStatus("Saved ✓");
  };

  const handleUpdateAnswer = () => {
    setIsButtonLocked(true);
    handleAnswerChange(editedAnswer);
    showStatus("Updated ✓");
    setIsButtonLocked(false);
  };

  // Finalize deck + save to Firestore
  const handleDoneConfirmYes = async () => {
    setView("status");
    showStatus("Saving deck...");

    try {
      // Create deck
      const deckData = {
        ownerId: currentUser.uid,
        title: deckTitle.trim() || "Untitled Deck",
        description: deckDescription,
        createdAt: serverTimestamp(),
        isPublic: false,
        category: selectedCategory,
        collaborators: [],
        // Deck image picked from Pixabay (optional)
        imageUrl: selectedImage?.webformatURL || null,
        imageAttribution: selectedImage
          ? { pageURL: selectedImage.pageURL, user: selectedImage.user }
          : null,
      };

      const deckRef = await addDoc(collection(db, "deck"), deckData);
      const newDeckId = deckRef.id;

      // Save flashcards (only saved ones)
      if (savedFlashcards.length > 0) {
        const writes = savedFlashcards.map((card) =>
          addDoc(collection(db, "flashcard"), {
            deckId: newDeckId,
            ownerId: currentUser.uid,
            front: card.front,
            back: card.back,
            type: card.type || "Multiple Choice",
            createdAt: serverTimestamp(),
            isPublic: false,
            category: selectedCategory,
            imagePath: "", // placeholder for per-card image if you add later
          })
        );
        await Promise.all(writes);
      }

      // Success feedback then reset to form
      showStatus("Deck saved successfully!");
      setTimeout(() => {
        // reset generator so user can create more
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
        setShowDeckPrompt(false);
        setSelectedImage(null);
        setStartPage("1");
        setEndPage("1");
        setSelectedCategory("");
        setSelectedSubcategory("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        setView("form");
        setIsFinishLocked(false);
      }, 3000);
    } catch (err) {
      console.error("Error saving deck:", err);
      showStatus("Error saving deck. Check console.");
      setIsFinishLocked(false);
    }
  };

  // Cancel flow
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const handleCancelClick = () => setShowCancelConfirm(true);

  const handleCancelConfirmYes = () => {
    setShowCancelConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFlashcardPairs([]);
    setUserAnswers([]);
    setSavedFlashcards([]);
    setSavedIndices(new Set());
    setCurrentFlashcardIndex(0);
    setFlashcardsGenerated(false);
    setSelectedCategory("");
    setSelectedSubcategory("");
    setDeckTitle("");
    setDeckDescription("");
    setTextInput("");
    setFile(null);
    setAiPrompt("");
    setStartPage("1");
    setEndPage("1");
    setView("status");
    showStatus("⚠️ Deck canceled and discarded.");
    setTimeout(() => {
      setStatus("");
      setView("form");
    }, 3000);
  };

  const handleCancelConfirmNo = () => {
    setShowCancelConfirm(false);
    showStatus("Continue editing your flashcards.");
  };

  // Current card
  const currentFlashcard =
    flashcardPairs.length > 0 && currentFlashcardIndex < flashcardPairs.length
      ? flashcardPairs[currentFlashcardIndex]
      : null;

  if (!currentUser) {
    return (
      <div className={styles.flashcardGenerator}>
        <h2>You must be signed in to use the Flashcard Generator</h2>
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
      {(view === "form" || view === "viewer") && (
        <button className={styles.backBtn} onClick={() => navigate("/main")}>
          ← Back to Main Menu
        </button>
      )}

      <h2>Flashcard Generator</h2>

      {/* STATUS VIEW */}
      {view === "status" && (
        <div className={styles.statusScreen}>
          <p className={styles.statusMessage}>{status}</p>
        </div>
      )}

      {/* FORM VIEW */}
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
            <div className={styles.charCounter}>Characters: {charCount.toLocaleString()}</div>
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
                    if (fileInputRef.current) fileInputRef.current.value = "";
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
              <label htmlFor="startPage" className={styles.pageLabel}>
                Start Page
              </label>
              <input
                type="number"
                id="startPage"
                name="startPage"
                className={styles.pageInput}
                value={startPage}
                onChange={(e) => setStartPage(e.target.value)}
                min="1"
              />

              <label htmlFor="endPage" className={styles.pageLabel}>
                End Page
              </label>
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

          <label>
            AI Prompt:
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={`Enter your instructions for AI 
For Example: 
    Generate 10 flashcards
    Only definitions
    Key Ideas
    Cause/Effect`}
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

      {/* LOADING VIEW */}
      {view === "loading" && (
        <div className={styles.loadingScreen}>
          <div className={styles.loadingDots}>
            <span></span><span></span><span></span>
          </div>
          <p className={styles.loadingText}>Generating flashcards...</p>
          {status && <p className={styles.loadingStatus}>{status}</p>}
        </div>
      )}

      {/* VIEWER VIEW */}
      {view === "viewer" && (
        <div className={styles.viewerContainer}>
          {!showDeckPrompt && currentFlashcard && (
            <div className={styles.flashcardViewer}>
              <button className={styles.cancelBtn} type="button" onClick={handleCancelClick}>
                Cancel
              </button>

              <div className={styles.viewerInner}>
                <div className={styles.viewerContent}>
                  <h3>
                    Flashcard {currentFlashcardIndex + 1} / {flashcardPairs.length}
                  </h3>
                  <p><strong>Q:</strong> {currentFlashcard[0]}</p>
                  <p><strong>Relevant:</strong> {currentFlashcard[1]}</p>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    {/* Use as Answer */}
                    <button
                      type="button"
                      className={styles.useAsAnswerBtn}
                      onClick={() => setEditedAnswer(currentFlashcard[1])}
                    >
                      Use as Answer
                    </button>

                    {/* Type selector (per card) */}
                    <select
                      value={flashcardTypes[currentFlashcardIndex] || "Multiple Choice"}
                      className={styles.typeBtn}
                      onChange={(e) => handleTypeChange(e.target.value)}
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
                      <button type="button" onClick={handlePrev} disabled={currentFlashcardIndex === 0}>
                        &lt; Prev
                      </button>
                      <button
                        type="button"
                        onClick={handleNext}
                        disabled={currentFlashcardIndex >= flashcardPairs.length - 1}
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
                          const [question] = currentFlashcard;
                          const answer = (editedAnswer || "").trim();

                          // Update userAnswers
                          setUserAnswers((prev) => {
                            const copy = [...prev];
                            copy[currentFlashcardIndex] = answer;
                            return copy;
                          });

                          // Upsert into savedFlashcards with type
                          setSavedFlashcards((prev) => {
                            const t = flashcardTypes[currentFlashcardIndex] || "Multiple Choice";
                            const idx = prev.findIndex((f) => f.index === currentFlashcardIndex);
                            if (idx !== -1) {
                              const copy = [...prev];
                              copy[idx] = {
                                index: currentFlashcardIndex,
                                front: question,
                                back: answer,
                                type: t,
                              };
                              return copy;
                            }
                            return [
                              ...prev,
                              { index: currentFlashcardIndex, front: question, back: answer, type: t },
                            ];
                          });

                          // Mark as saved
                          setSavedIndices((prev) => new Set(prev).add(currentFlashcardIndex));

                          // Feedback
                          if (savedIndices.has(currentFlashcardIndex)) {
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
                              prev.filter((c) => c.index !== currentFlashcardIndex)
                            );
                            setSavedIndices((prev) => {
                              const ns = new Set(prev);
                              ns.delete(currentFlashcardIndex);
                              return ns;
                            });
                            showStatus("Removed flashcard from deck.");
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

              <div ref={bottomRef} />
            </div>
          )}
        </div>
      )}

      {/* FINALIZE DECK MODAL */}
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
                onChange={(e) => setDeckDescription(e.target.value)}
                placeholder="Enter a short description (optional)"
              />
            </label>

            {/* Pixabay deck image (optional) */}
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
                disabled={isFinishLocked}
                onClick={() => {
                  if (!deckTitle.trim()) {
                    alert("Please enter a deck title first.");
                    return;
                  }
                  if (!selectedCategory) {
                    alert("Please select a category.");
                    return;
                  }
                  setIsFinishLocked(true);
                  setShowDeckPrompt(false);
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

      {/* Cancel confirmation */}
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
    </div>
  );
}

export default FlashcardGenerator;
