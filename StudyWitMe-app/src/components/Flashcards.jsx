import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, onSnapshot, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import styles from "./Flashcards.module.css";

export default function Flashcards() {
    const { currentUser } = useAuth();
    const [decks, setDecks] = useState([]);
    const [filteredDecks, setFilteredDecks] = useState([]);
    const [deckCounts, setDeckCounts] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [sortOption, setSortOption] = useState("category");
    //Delete Mode
    const [deleteMode, setDeleteMode] = useState(false);
    const [selectedDecks, setSelectedDecks] = useState([]);
    // 🔹 Delete confirmation prompt states
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteStatus, setDeleteStatus] = useState("")

    // selectedCategories: array of category names currently checked.
    // We'll initialize this to "all categories" once decks are first loaded.
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [showFilter, setShowFilter] = useState(false);
    const filterRef = useRef(null);

    // used to only auto-initialize selectedCategories once after initial deck load
    const didInitCategoriesRef = useRef(false);

    const navigate = useNavigate();

    // 🔹 Load decks
    useEffect(() => {
        if (!currentUser) {
        setIsLoading(false);
        setDecks([]);
        return;
        }

        setIsLoading(true);
        const decksCollectionRef = collection(db, "deck");
        const q = query(decksCollectionRef, where("ownerId", "==", currentUser.uid));

        const unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
            const allDecks = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            }));
            setDecks(allDecks);

            // Load deck flashcard counts
            const counts = {};
            const flashcardsCollectionRef = collection(db, "flashcard");
            for (const deck of allDecks) {
            const cardQuery = query(flashcardsCollectionRef, where("deckId", "==", deck.id));
            const cardSnapshot = await getDocs(cardQuery);
            counts[deck.id] = cardSnapshot.size;
            }
            setDeckCounts(counts);
            setTimeout(() => {
                setIsLoading(false);
            }, 3000)
        },
        (error) => {
            console.error("Error fetching decks:", error);
            setIsLoading(false);
        }
        );

        return () => unsubscribe();
    }, [currentUser]);

    // 🔹 Gather unique categories (derived from loaded decks)
    const categories = [...new Set(decks.map((d) => d.category).filter(Boolean))];

    useEffect(() => {
        // Initialize selectedCategories once, after first decks load
        if (!didInitCategoriesRef.current && categories.length > 0) {
            setSelectedCategories([...categories]);
            didInitCategoriesRef.current = true;
        }

        // If categories becomes empty, clear selectedCategories only if not already empty
        if (categories.length === 0 && selectedCategories.length > 0) {
            setSelectedCategories([]);
        }
    }, [categories, selectedCategories]);

    // 🔹 Close the filter panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
        if (filterRef.current && !filterRef.current.contains(event.target)) {
            setShowFilter(false);
        }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 🔹 Handle sort/filter updates
    useEffect(() => {
        let updated = [...decks];

        // NOTE: empty selectedCategories => show no decks (Clear Filter hides all)
        if (selectedCategories && selectedCategories.length > 0) {
        updated = updated.filter((deck) => selectedCategories.includes(deck.category));
        } else {
        // selectedCategories empty => no decks
        updated = [];
        }

        // Sorting
        if (sortOption === "az") {
        updated.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        } else if (sortOption === "za") {
        updated.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        } else if (sortOption === "newest") {
        updated.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        } else if (sortOption === "oldest") {
        updated.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        } else if (sortOption === "category") {
        updated.sort((a, b) => (a.category || "").localeCompare(b.category || ""));
        }

        setFilteredDecks(updated);
        //scroll to the top of gallery on change
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, [decks, sortOption, selectedCategories]);

    // 🔹 Toggle category selection (multi-select)
    const toggleCategory = (category) => {
        setSelectedCategories((prev) =>
        prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
        );
    };

    // 🔹 Select All / Clear All
    const handleSelectAll = () => setSelectedCategories([...categories]);
    const handleClearFilter = () => setSelectedCategories([]); // empty => hide all decks

    // 🔹 Handle deck selection for deletion
    const toggleDeckSelection = (deckId) => {
        setSelectedDecks((prev) =>
            prev.includes(deckId) ? prev.filter((id) => id !== deckId) : [...prev, deckId]
        );
    };

    // 🔹 Handles actual deletion of selected decks and flashcards
    const handleConfirmDelete = async () => {
        try {
            for (const deckId of selectedDecks) {
            // 1️⃣ Delete flashcards belonging to this deck
            const flashcardsRef = collection(db, "flashcard");
            const flashcardQuery = query(flashcardsRef, where("deckId", "==", deckId));
            const flashcardsSnapshot = await getDocs(flashcardQuery);

            for (const cardDoc of flashcardsSnapshot.docs) {
                await deleteDoc(cardDoc.ref);
            }

            // 2️⃣ Delete the deck itself
            await deleteDoc(doc(db, "deck", deckId));
            }

            // After all deletions:
            setDeleteStatus("All selected decks have been discarded.");

            // Show success briefly before closing
            setTimeout(() => {
            setShowDeleteConfirm(false);
            setDeleteMode(false);
            setSelectedDecks([]);
            setDeleteStatus("");
            }, 2000);
        } catch (err) {
            console.error("Error deleting decks:", err);
            setDeleteStatus("Error deleting decks. Check console.");
        }
    };

    // ---- Render states ----
    if (!currentUser) {
        return (
        <div className={styles.overlay}>
            <div className={styles.menuBackdrop}>
            <h2>Oops, you're not signed in</h2>
            <p>
                Please sign in to view your decks.
            </p>
            </div>
        </div>
        );
    }

    if (isLoading) {
        return (
        <div className={styles.overlay}>
            <div className={styles.loadingToolbar}>
                <h1 className={styles.loadingTitle}>Loading Decks...</h1>
            </div>
        </div>
        );
    }

    if (decks.length === 0) {
        return (
        <div className={styles.overlay}>
            <div className={`${styles.menuBackdrop} ${styles.noCards}`}>
            <h2>No Decks Yet</h2>
            <p>Why not create a new deck?</p>
            <div
                className={styles.placeholderCard}
                onClick={() => navigate("/flashcards/create")}
            >
                <span className={styles.plusSign}>+</span>
            </div>
            <button className={styles.backButton} onClick={() => navigate("/main")}>
                ← Back to Main Menu
            </button>
            </div>
        </div>
        );
    }

    return (
        <div className={styles.overlay}>
            <div className={styles.stickyToolbar}>

                {/* Top Toolbar */}
                <div className={styles.deckToolbar}>
                <div className={styles.toolbarLeft}>
                    {/* 🔹 Delete toggler */}
                    <button className={styles.deleteToggle}
                        onClick={() => {
                            console.log("Delete mode:", deleteMode, "Selected decks:", selectedDecks);
                            if (!deleteMode) {
                            // entering delete mode
                            setDeleteMode(true);
                            setSelectedDecks([]);
                            return;
                            }

                            // ✅ exiting delete mode
                            if (selectedDecks.length > 0) {
                            console.log("Opening confirmation...");
                            setShowDeleteConfirm(true);
                            } else {
                            console.log("No decks selected, exiting delete mode...");
                            setDeleteMode(false);
                            setSelectedDecks([]);
                            }
                        }}
                    >
                        {deleteMode ? "Done" : "Delete"}
                    </button>
                    <button onClick={() => navigate("/flashcards/share")}>Share</button>
                </div>

                <h1 className={styles.toolbarTitle}>Your Decks</h1>

                <div className={styles.toolbarRight}>
                    {/* Sort Dropdown */}
                    <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value)}
                    className={styles.dropdown}
                    >
                    <option value="category">Category</option>
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="az">A–Z</option>
                    <option value="za">Z–A</option>
                    </select>

                    {/* Filter Button + Floating Panel */}
                    <div className={styles.filterWrapper} ref={filterRef}>
                    <button
                        className={styles.dropdownButton}
                        onClick={() => setShowFilter((prev) => !prev)}
                    >
                        Filter ▾
                    </button>

                    {showFilter && (
                        <div className={styles.filterDropdown}>
                        {categories.length > 0 ? (
                            <>
                            {categories.map((cat) => (
                                <label key={cat} className={styles.filterItem}>
                                <input
                                    type="checkbox"
                                    checked={selectedCategories.includes(cat)}
                                    onChange={() => toggleCategory(cat)}
                                />
                                <span>{cat}</span>
                                </label>
                            ))}

                            <div className={styles.filterButtons}>
                                <button type="button" onClick={handleSelectAll}>
                                Select All
                                </button>
                                <button type="button" onClick={handleClearFilter}>
                                Clear Filter
                                </button>
                            </div>
                            </>
                        ) : (
                            <p style={{ padding: 12 }}>No categories found</p>
                        )}
                        </div>
                    )}
                    </div>
                </div>
                </div>
            </div>
        <div className={styles.menuBackdrop}>
            {/* 🔹 Deck Gallery */}
            <div className={styles.flashcardGallery}>
                {sortOption === "category" ? (
                    Object.entries(
                        filteredDecks.reduce((groups, deck) => {
                            const cat = deck.category || "Uncategorized";
                            if (!groups[cat]) groups[cat] = [];
                            groups[cat].push(deck);
                            return groups;
                        }, {})
                    ).map(([cat, decksInCat]) => (
                        <div key={cat} className={styles.categorySection}>
                            <h3 className={styles.categoryHeader}>{cat}</h3>
                            <div className={styles.categoryGrid}>
                                {decksInCat.map((deck) => {
                                    const isSelected = selectedDecks.includes(deck.id);
                                    return (
                                        <div
                                            key={deck.id}
                                            className={`${styles.deckCard} ${isSelected ? styles.selectedDeck : ""}`}
                                        >
                                            {/* 🔹 Delete selection button (only in delete mode) */}
                                            {deleteMode && (
                                                <button
                                                    className={`${styles.deleteSelectButton} ${isSelected ? styles.selected : ""}`}
                                                    onClick={() => toggleDeckSelection(deck.id)}
                                                >
                                                    {isSelected ? "✕" : "✓"}
                                                </button>
                                            )}

                                            {/* Deck Meta Info */}
                                            <div className={styles.deckMeta}>
                                                <div className={styles.deckCardContent}>
                                                    <h3>{deck.title || "Untitled Deck"}</h3>
                                                    <p>Cards: {deckCounts[deck.id] || 0}</p>

                                                    {/* Placeholder for future variable: Cards Mastered */}
                                                    <p>Cards Mastered: 0% {/* TODO: replace with {deck.masteryPercent}% */}</p>

                                                    {/* Progress bar (will reflect mastery percent later) */}
                                                    <div className={styles.progressBar}>
                                                        <div
                                                            className={styles.progressFill}
                                                            style={{ width: "0%" }}
                                                        ></div>{" "}
                                                        {/* TODO: dynamic width based on mastery */}
                                                    </div>

                                                    {/* Placeholder for future variable: Last Quiz Score */}
                                                    <p>Last Quiz Score: N/A {/* TODO: replace with {deck.lastQuizScore}% */}</p>

                                                    {/* Placeholder for future variable: Last Studied */}
                                                    <p>Last Studied: Jan 1st {/* TODO: replace with actual date */}</p>
                                                </div>
                                            </div>

                                            <div className={styles.deckButtons}>
                                                <button
                                                    className={styles.deckButtonSmall}
                                                    onClick={() => navigate("/flashcards_study", { state: { deck } })}
                                                >
                                                    Study
                                                </button>
                                                <button
                                                    className={styles.deckButtonSmall}
                                                    onClick={() => navigate("/flashcards_quiz", { state: { deck } })}
                                                >
                                                    Quiz
                                                </button>
                                                <button
                                                    className={styles.deckButtonSmall}
                                                    onClick={() => navigate(`/manage/${deck.id}`)}
                                                >
                                                    Manage
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                ) : (
                    // 🔹 Normal grid for other sorts
                    <div className={styles.categoryGrid}>
                        {filteredDecks.map((deck) => {
                            const isSelected = selectedDecks.includes(deck.id);
                            return (
                                <div
                                    key={deck.id}
                                    className={`${styles.deckCard} ${isSelected ? styles.selectedDeck : ""}`}
                                >
                                    {/* 🔹 Delete selection button (only in delete mode) */}
                                    {deleteMode && (
                                        <button
                                            className={`${styles.deleteSelectButton} ${isSelected ? styles.selected : ""}`}
                                            onClick={() => toggleDeckSelection(deck.id)}
                                        >
                                            {isSelected ? "✕" : "✓"}
                                        </button>
                                    )}

                                    {/* Deck Meta Info */}
                                    <div className={styles.deckMeta}>
                                        <div className={styles.deckCardContent}>
                                            <h3>{deck.title || "Untitled Deck"}</h3>
                                            <p>Cards: {deckCounts[deck.id] || 0}</p>

                                            {/* Placeholder for future variable: Cards Mastered */}
                                            <p>Cards Mastered: 0% {/* TODO: replace with {deck.masteryPercent}% */}</p>

                                            {/* Progress bar (will reflect mastery percent later) */}
                                            <div className={styles.progressBar}>
                                                <div
                                                    className={styles.progressFill}
                                                    style={{ width: "0%" }}
                                                ></div>{" "}
                                                {/* TODO: dynamic width based on mastery */}
                                            </div>

                                            {/* Placeholder for future variable: Last Quiz Score */}
                                            <p>Last Quiz Score: N/A {/* TODO: replace with {deck.lastQuizScore}% */}</p>

                                            {/* Placeholder for future variable: Last Studied */}
                                            <p>Last Studied: Jan 1st {/* TODO: replace with actual date */}</p>
                                        </div>
                                    </div>

                                    <div className={styles.deckButtons}>
                                        <button
                                            className={styles.deckButtonSmall}
                                            onClick={() => navigate("/flashcards_study", { state: { deck } })}
                                        >
                                            Study
                                        </button>
                                        <button
                                            className={styles.deckButtonSmall}
                                            onClick={() => navigate("/flashcards_quiz", { state: { deck } })}
                                        >
                                            Quiz
                                        </button>
                                        <button
                                            className={styles.deckButtonSmall}
                                            onClick={() => navigate(`/manage/${deck.id}`)}
                                        >
                                            Manage
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 🔹 Delete Confirmation Prompt */}
            {showDeleteConfirm && (
            <div className={styles.modalOverlay}>
                <div className={styles.confirmationBox}>
                {/* Top left button */}
                {deleteStatus === "" && (
                    <button
                    className={styles.changeSelectionButton}
                    onClick={() => setShowDeleteConfirm(false)}
                    >
                    Change Selection
                    </button>
                )}

                {/* Status or message */}
                <div className={styles.confirmationContent}>
                    {deleteStatus === "" && (
                    <>
                        <h3>Are you sure?</h3>
                        <p>Your flashcards will be permanently lost.</p>

                        <div className={styles.confirmationButtons}>
                        <button
                            className={styles.confirmButton}
                            onClick={async () => {
                            setDeleteStatus("Deleting Flashcards...");
                            await handleConfirmDelete();
                            }}
                        >
                            Confirm
                        </button>
                        <button
                            className={styles.cancelButton}
                            onClick={() => {
                            setSelectedDecks([]);
                            setDeleteMode(false);
                            setShowDeleteConfirm(false);
                            }}
                        >
                            Cancel
                        </button>
                        </div>
                    </>
                    )}

                    {deleteStatus && deleteStatus !== "" && (
                    <>
                        <h3>{deleteStatus}</h3>
                    </>
                    )}
                </div>
                </div>
            </div>
            )}
        </div>
        </div>
    );
}