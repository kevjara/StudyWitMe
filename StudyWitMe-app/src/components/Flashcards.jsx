import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import {
    collection,
    onSnapshot,
    query,
    where,
    getDocs,
    deleteDoc,
    doc,
} from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import styles from "./Flashcards.module.css";

export default function Flashcards() {
    const { currentUser, loading } = useAuth();

    // Decks data + derived lists
    const [decks, setDecks] = useState([]);
    const [filteredDecks, setFilteredDecks] = useState([]);
    const [deckCounts, setDeckCounts] = useState({}); // { [deckId]: number }

    // UI state
    const [isLoading, setIsLoading] = useState(true);
    const [sortOption, setSortOption] = useState("category");

    // Delete mode
    const [deleteMode, setDeleteMode] = useState(false);
    const [selectedDecks, setSelectedDecks] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteStatus, setDeleteStatus] = useState("");

    // Filter state
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [showFilter, setShowFilter] = useState(false);
    const filterRef = useRef(null);
    const didInitCategoriesRef = useRef(false);

    const navigate = useNavigate();

    // ---- Load decks for current user ----
    useEffect(() => {
        if (loading) return;

        if (!currentUser) {
            setIsLoading(false);
            setDecks([]);
            setDeckCounts({});
            return;
        }

        setIsLoading(true);
        const decksRef = collection(db, "deck");
        const qDecks = query(decksRef, where("ownerId", "==", currentUser.uid));

        let isActive = true; // guard against state updates after unmount

        const unsub = onSnapshot(
            qDecks,
            async (snap) => {
                const allDecks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                setDecks(allDecks);

                const counts = {};
                try {
                    const flashcardsRef = collection(db, "flashcard");
                    await Promise.all(
                        allDecks.map(async (deck) => {
                            try {
                                const qCards = query(flashcardsRef, where("deckId", "==", deck.id));
                                const cardSnap = await getDocs(qCards);
                                counts[deck.id] = cardSnap.size;
                            } catch (e) {
                                console.warn("Count read denied for deck", deck.id, e);
                                counts[deck.id] = 0; // fall back
                            }
                        })
                    );
                } finally {
                    setDeckCounts(counts);
                    setIsLoading(false); // ← always clear
                }
            },
            (err) => {
                console.error("Error fetching decks:", err);
                setIsLoading(false);
            }
        );

        return () => {
            isActive = false;
            unsub();
        };
    }, [loading, currentUser, db]);

    // Unique categories from decks
    const categories = [...new Set(decks.map((d) => d.category).filter(Boolean))];

    // Initialize selectedCategories to all categories once
    useEffect(() => {
        if (!didInitCategoriesRef.current && categories.length > 0) {
            setSelectedCategories([...categories]);
            didInitCategoriesRef.current = true;
        }
        if (categories.length === 0) {
            setSelectedCategories([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories]);

    // Close filter dropdown on outside click
    useEffect(() => {
        const onDocClick = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) {
                setShowFilter(false);
            }
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    // Apply sort/filter
    useEffect(() => {
        let updated = [...decks];

        // If selectedCategories is empty => hide all
        if (selectedCategories && selectedCategories.length > 0) {
            updated = updated.filter((d) => selectedCategories.includes(d.category));
        } else {
            updated = [];
        }

        // Sort options
        switch (sortOption) {
            case "az":
                updated.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
                break;
            case "za":
                updated.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
                break;
            case "newest":
                updated.sort(
                    (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
                );
                break;
            case "oldest":
                updated.sort(
                    (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
                );
                break;
            case "category":
            default:
                updated.sort((a, b) =>
                    (a.category || "").localeCompare(b.category || "")
                );
                break;
        }

        setFilteredDecks(updated);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, [decks, sortOption, selectedCategories]);

    // Category helpers
    const toggleCategory = (cat) => {
        setSelectedCategories((prev) =>
            prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
        );
    };
    const handleSelectAll = () => setSelectedCategories([...categories]);
    const handleClearFilter = () => setSelectedCategories([]);

    // Delete selection helpers
    const toggleDeckSelection = (deckId) => {
        setSelectedDecks((prev) =>
            prev.includes(deckId) ? prev.filter((id) => id !== deckId) : [...prev, deckId]
        );
    };

    // Confirm delete of selected decks + their flashcards
    const handleConfirmDelete = async () => {
        try {
            for (const deckId of selectedDecks) {
                // 1) delete flashcards for deck
                const flashcardsRef = collection(db, "flashcard");
                const qCards = query(flashcardsRef, where("deckId", "==", deckId));
                const cardSnap = await getDocs(qCards);
                await Promise.all(cardSnap.docs.map((d) => deleteDoc(d.ref)));

                // 2) delete deck
                await deleteDoc(doc(db, "deck", deckId));
            }

            setDeleteStatus("All selected decks have been discarded.");
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
    if (!currentUser && !loading) {
        return (
            <div className={styles.overlay}>
                <div className={styles.menuBackdrop}>
                    <h2>Oops, you're not signed in</h2>
                    <p>
                        Please <Link to="/login">sign in</Link> to view your decks.
                    </p>
                    <button className={styles.backButton} onClick={() => navigate("/main")}>
                        ← Back to Main Menu
                    </button>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className={styles.overlay}>
                <div className={styles.menuBackdrop}>
                    <h2>Loading decks...</h2>
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

    // ---- Main UI ----
    return (
        <div className={styles.overlay}>
            <div className={styles.menuBackdrop}>
                <h2>Your Decks</h2>

                <div className={styles.stickyToolbar}>
                    <button className={styles.stickyBackButton} onClick={() => navigate("/main")}>
                        ← Back to Main Menu
                    </button>

                    <div className={styles.deckToolbar}>
                        <div className={styles.toolbarLeft}>
                            {/* Delete toggler */}
                            <button
                                onClick={() => {
                                    if (!deleteMode) {
                                        setDeleteMode(true);
                                        setSelectedDecks([]);
                                        return;
                                    }
                                    if (selectedDecks.length > 0) {
                                        setShowDeleteConfirm(true);
                                    } else {
                                        setDeleteMode(false);
                                        setSelectedDecks([]);
                                    }
                                }}
                            >
                                {deleteMode ? "Done" : "Delete"}
                            </button>

                            <button onClick={() => navigate("/flashcards/share")}>Share</button>
                        </div>

                        <div className={styles.toolbarRight}>
                            {/* Sort */}
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

                            {/* Filter */}
                            <div className={styles.filterWrapper} ref={filterRef}>
                                <button
                                    className={styles.dropdownButton}
                                    onClick={() => setShowFilter((p) => !p)}
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

                {/* Deck Gallery */}
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
                                                {/* Delete checkbox (only in delete mode) */}
                                                {deleteMode && (
                                                    <button
                                                        className={`${styles.deleteSelectButton} ${isSelected ? styles.selected : ""}`}
                                                        onClick={() => toggleDeckSelection(deck.id)}
                                                    >
                                                        {isSelected ? "✕" : "✓"}
                                                    </button>
                                                )}

                                                <div className={styles.deckMeta}>
                                                    <div className={styles.deckCardContent}>
                                                        <h3>{deck.title || "Untitled Deck"}</h3>
                                                        <p>Cards: {deckCounts[deck.id] || 0}</p>

                                                        <p>Cards Mastered: 0%</p>
                                                        <div className={styles.progressBar}>
                                                            <div className={styles.progressFill} style={{ width: "0%" }} />
                                                        </div>

                                                        <p>Last Quiz Score: N/A</p>
                                                        <p>Last Studied: Jan 1st</p>
                                                    </div>
                                                </div>

                                                <div className={styles.deckButtons}>
                                                    <button
                                                        className={styles.deckButtonSmall}
                                                        onClick={() => navigate(`/flashcards/deck/${deck.id}/study`)}
                                                    >
                                                        Study
                                                    </button>
                                                    <button
                                                        className={styles.deckButtonSmall}
                                                        onClick={() => navigate(`/flashcards/deck/${deck.id}/quiz`)}
                                                    >
                                                        Quiz
                                                    </button>
                                                    <button
                                                        className={styles.deckButtonSmall}
                                                        onClick={() => navigate(`/flashcards/deck/${deck.id}/manage`)}
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
                        <div className={styles.categoryGrid}>
                            {filteredDecks.map((deck) => {
                                const isSelected = selectedDecks.includes(deck.id);
                                return (
                                    <div
                                        key={deck.id}
                                        className={`${styles.deckCard} ${isSelected ? styles.selectedDeck : ""}`}
                                    >
                                        {deleteMode && (
                                            <button
                                                className={`${styles.deleteSelectButton} ${isSelected ? styles.selected : ""}`}
                                                onClick={() => toggleDeckSelection(deck.id)}
                                            >
                                                {isSelected ? "✕" : "✓"}
                                            </button>
                                        )}

                                        <div className={styles.deckMeta}>
                                            <div className={styles.deckCardContent}>
                                                <h3>{deck.title || "Untitled Deck"}</h3>
                                                <p>Cards: {deckCounts[deck.id] || 0}</p>

                                                <p>Cards Mastered: 0%</p>
                                                <div className={styles.progressBar}>
                                                    <div className={styles.progressFill} style={{ width: "0%" }} />
                                                </div>

                                                <p>Last Quiz Score: N/A</p>
                                                <p>Last Studied: Jan 1st</p>
                                            </div>
                                        </div>

                                        <div className={styles.deckButtons}>
                                            <button
                                                className={styles.deckButtonSmall}
                                                onClick={() => navigate(`/flashcards/deck/${deck.id}/study`)}
                                            >
                                                Study
                                            </button>
                                            <button
                                                className={styles.deckButtonSmall}
                                                onClick={() => navigate(`/flashcards/deck/${deck.id}/quiz`)}
                                            >
                                                Quiz
                                            </button>
                                            <button
                                                className={styles.deckButtonSmall}
                                                onClick={() => navigate(`/flashcards/deck/${deck.id}/manage`)}
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

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <div className={styles.modalOverlay}>
                        <div className={styles.confirmationBox}>
                            {deleteStatus === "" && (
                                <button
                                    className={styles.changeSelectionButton}
                                    onClick={() => setShowDeleteConfirm(false)}
                                >
                                    Change Selection
                                </button>
                            )}

                            <div className={styles.confirmationContent}>
                                {deleteStatus === "" ? (
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
                                ) : (
                                    <h3>{deleteStatus}</h3>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
