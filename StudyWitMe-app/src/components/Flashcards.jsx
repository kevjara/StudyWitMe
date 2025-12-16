import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useDecks } from "../context/DecksContext";
import { useNavigate, Link } from "react-router-dom";
import { db } from "../services/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import styles from "./Flashcards.module.css";
import { refreshPixabayImage } from "../utils/imageRefresh"; // Import utility

export default function Flashcards() {
    const { currentUser, loading } = useAuth();

    // Cached deck system
    const { decks, loadingDecks, deckCounts } = useDecks();

    const [filteredDecks, setFilteredDecks] = useState([]);
    const [sortOption, setSortOption] = useState("category");

    // Delete mode
    const [deleteMode, setDeleteMode] = useState(false);
    const [selectedDecks, setSelectedDecks] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteStatus, setDeleteStatus] = useState("");

    const [refreshedUrls, setRefreshedUrls] = useState({});
    const [masteryData, setMasteryData] = useState({}); 

    // Filter state
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [showFilter, setShowFilter] = useState(false);
    const filterRef = useRef(null);
    const didInitCategoriesRef = useRef(false);

    const navigate = useNavigate();

    // 🔹 Categories from cached decks - memoized to prevent infinite loops
    const categories = useMemo(() => 
        [...new Set(decks.map((d) => d.category).filter(Boolean))],
        [decks]
    );

    // Initialize category filter once
    useEffect(() => {
        if (!didInitCategoriesRef.current && categories.length > 0) {
            setSelectedCategories([...categories]);
            didInitCategoriesRef.current = true;
        }
        if (categories.length === 0) setSelectedCategories([]);
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

    // Apply sort & filtering
    useEffect(() => {
        let updated = [...decks];

        if (selectedCategories?.length > 0) {
            updated = updated.filter((d) => selectedCategories.includes(d.category));
        } else {
            updated = [];
        }

        switch (sortOption) {
            case "az":
                updated.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
                break;
            case "za":
                updated.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
                break;
            case "newest":
                updated.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                break;
            case "oldest":
                updated.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
                break;
            case "category":
            default:
                updated.sort((a, b) => (a.category || "").localeCompare(b.category || ""));
                break;
        }

        setFilteredDecks(updated);
        window.scrollTo(0, 0); // 🔥 Fixed infinite loop bug
    }, [decks, sortOption, selectedCategories]);

    // Fetch mastery data for all user's decks
    useEffect(() => {
        const fetchMasteryData = async () => {
            if (!currentUser || decks.length === 0) return;

            try {
                const masteryRef = collection(db, "mastery");
                const q = query(masteryRef, where("userId", "==", currentUser.uid));
                const snap = await getDocs(q);

                const masteryMap = {};
                snap.docs.forEach((doc) => {
                    const data = doc.data();
                    masteryMap[data.deckId] = {
                        masteryLevel: data.masteryLevel || 0,
                        lastStudied: data.lastStudied,
                        quizAttempts: data.quizAttempts || []
                    };
                });

                setMasteryData(masteryMap);
            } catch (err) {
                console.error("Error fetching mastery data:", err);
            }
        };

        fetchMasteryData();
    }, [currentUser, decks]);

    // Delete helpers
    const toggleCategory = (cat) => {
        setSelectedCategories((prev) =>
            prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
        );
    };
    const handleSelectAll = () => setSelectedCategories([...categories]);
    const handleClearFilter = () => setSelectedCategories([]);

    const toggleDeckSelection = (deckId) => {
        setSelectedDecks((prev) =>
            prev.includes(deckId) ? prev.filter((id) => id !== deckId) : [...prev, deckId]
        );
    };

    const handleConfirmDelete = async () => {
        try {
            for (const deckId of selectedDecks) {
                console.warn("TODO: implement deletion here since firestore removed");
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
            setDeleteStatus("Error deleting decks.");
        }
    };
    
    const handleImageError = async (e, deck) => {
        const isOwner = currentUser?.uid === deck.ownerId; 
        
        // Prevent infinite retry loops - no pixabayId means we can't fetch a new image
        if (!deck.pixabayId) {
            console.warn(`⚠️ No pixabayId for deck ${deck.id}, cannot refresh`);
            e.target.style.display = 'none';
            return;
        }
        
        // Check current refresh status
        const currentStatus = refreshedUrls[deck.id];
        if (currentStatus === 'loading') {
            console.log(`⏳ Already fetching fresh URL for deck ${deck.id}...`);
            return;
        }
        if (currentStatus === 'failed') {
            console.warn(`⚠️ Previously failed to refresh deck ${deck.id}, hiding image`);
            e.target.style.display = 'none';
            return;
        }
        // If we have a refreshed URL and it's STILL failing, don't retry
        if (currentStatus && currentStatus !== 'loading' && currentStatus !== 'failed') {
            console.warn(`⚠️ Refreshed URL also expired for deck ${deck.id}, giving up`);
            setRefreshedUrls(prev => ({ ...prev, [deck.id]: 'failed' }));
            e.target.style.display = 'none';
            return;
        }

        // Mark that we're attempting a refresh to prevent multiple simultaneous calls
        setRefreshedUrls(prev => ({ ...prev, [deck.id]: 'loading' }));
        e.target.style.opacity = 0.3;
        console.log(`🖼️ Cached image expired for deck ${deck.id} (Pixabay ID: ${deck.pixabayId}), fetching fresh URL...`);
        
        // Fetch fresh URL from Pixabay and update Firestore cache
        const newUrl = await refreshPixabayImage(
            'deck', 
            deck.id, 
            deck.pixabayId, 
            isOwner // Only update database if user owns this deck
        );

        if (newUrl) {
            console.log(`✅ Fresh URL obtained for deck ${deck.id}: ${newUrl.substring(0, 50)}...`);
            setRefreshedUrls(prev => ({ ...prev, [deck.id]: newUrl }));
            e.target.src = newUrl;
            e.target.style.opacity = 1;
            e.target.style.display = 'block';
        } else {
            console.error(`❌ Failed to fetch fresh URL for deck ${deck.id}`);
            setRefreshedUrls(prev => ({ ...prev, [deck.id]: 'failed' }));
            e.target.style.display = 'none';
        }
    };


    // ─────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────

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

    if (loadingDecks) {
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
            {/* Toolbar */}
            <div className={styles.stickyToolbar}>
                <div className={styles.deckToolbar}>
                    <div className={styles.toolbarLeft}>
                        {/* 🔹 Delete toggler */}
                        <button className={styles.deleteToggle}
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

                    <h1 className={styles.toolbarTitle}>Your Decks</h1>

                    <div className={styles.toolbarRight}>
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
            <div className={styles.menuBackdrop}>
                {/* Deck Gallery */}
                <div className={styles.flashcardGallery}>
                    {(sortOption === "category"
                        ? Object.entries(
                              filteredDecks.reduce((groups, deck) => {
                                  const cat = deck.category || "Uncategorized";
                                  (groups[cat] ??= []).push(deck);
                                  return groups;
                              }, {})
                          )
                        : [[null, filteredDecks]]
                    ).map(([cat, decksInCat]) => (
                        <div key={cat || "all"} className={styles.categorySection}>
                            {cat && <h3 className={styles.categoryHeader}>{cat}</h3>}
                            <div className={styles.categoryGrid}>
                                {decksInCat.map((deck) => {
                                    const isSelected = selectedDecks.includes(deck.id);

                                    return (
                                        <div
                                            key={deck.id}
                                            className={`${styles.deckCard} ${
                                                isSelected ? styles.selectedDeck : ""
                                            }`}
                                        >
                                            {/* Delete selector */}
                                            {deleteMode && (
                                                <button
                                                    className={`${styles.deleteSelectButton} ${
                                                        isSelected ? styles.selected : ""
                                                    }`}
                                                    onClick={() => toggleDeckSelection(deck.id)}
                                                >
                                                    {isSelected ? "✕" : "✓"}
                                                </button>
                                            )}
                                            
                                            {/* Deck Cover Image with Smart Caching */}
                                            {(deck.imagePath || deck.pixabayId) && (
                                                <div style={{width: '100%', height: '100px', overflow: 'hidden', borderRadius: '8px 8px 0 0', background: '#f0f0f0'}}>
                                                    <img
                                                        src={refreshedUrls[deck.id] && refreshedUrls[deck.id] !== 'loading' && refreshedUrls[deck.id] !== 'failed' 
                                                            ? refreshedUrls[deck.id] 
                                                            : deck.imagePath}
                                                        alt={deck.title}
                                                        style={{
                                                            width: '100%', 
                                                            height: '100%', 
                                                            objectFit: 'cover',
                                                            opacity: refreshedUrls[deck.id] === 'loading' ? 0.3 : 1,
                                                            transition: 'opacity 0.3s'
                                                        }}
                                                        onError={(e) => handleImageError(e, deck)}
                                                    />
                                                </div>
                                            )}
                                            {/* End Deck Cover Image */}

                                            {/* Deck Image */}
                                            {(deck.imagePath || deck.pixabayId) && (
                                                <div
                                                    style={{
                                                        width: "100%",
                                                        height: "100px",
                                                        overflow: "hidden",
                                                        borderRadius: "8px 8px 0 0",
                                                        background: "#f0f0f0",
                                                    }}
                                                >
                                                    <img
                                                        src={
                                                            refreshedUrls[deck.id] &&
                                                            refreshedUrls[deck.id] !== "loading" &&
                                                            refreshedUrls[deck.id] !== "failed"
                                                                ? refreshedUrls[deck.id]
                                                                : deck.imagePath
                                                        }
                                                        alt={deck.title}
                                                        style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            objectFit: "cover",
                                                            opacity:
                                                                refreshedUrls[deck.id] === "loading"
                                                                    ? 0.3
                                                                    : 1,
                                                            transition: "opacity 0.3s",
                                                        }}
                                                        onError={(e) => handleImageError(e, deck)}
                                                    />
                                                </div>
                                            )}

                                            {/* Deck Info */}
                                            <div className={styles.deckMeta}>
                                                <div className={styles.deckCardContent}>
                                                    <h3>{deck.title || "Untitled Deck"}</h3>
                                                    <p>Cards: {deckCounts[deck.id] || 0}</p>

                                                    <p>Cards Mastered: {masteryData[deck.id]?.masteryLevel || 0}%</p>
                                                    <div className={styles.progressBar}>
                                                        <div className={styles.progressFill} style={{ width: `${masteryData[deck.id]?.masteryLevel || 0}%` }} />
                                                    </div>

                                                    <p>Last Quiz Score: {
                                                        masteryData[deck.id]?.quizAttempts?.length > 0
                                                            ? `${masteryData[deck.id].quizAttempts[masteryData[deck.id].quizAttempts.length - 1]}%`
                                                            : "N/A"
                                                    }</p>
                                                    <p>Last Studied: {
                                                        masteryData[deck.id]?.lastStudied
                                                            ? new Date(masteryData[deck.id].lastStudied.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                            : "Never"
                                                    }</p>
                                                </div>
                                            </div>

                                            {/* ACTION BUTTONS */}
                                            <div className={styles.deckButtons}>
                                                <button
                                                    className={styles.deckButtonSmall}
                                                    onClick={() =>
                                                        navigate(
                                                            `/flashcards/deck/${deck.id}/study`,
                                                            { state: { deck } }
                                                        )
                                                    }
                                                >
                                                    Study
                                                </button>

                                                <button
                                                    className={styles.deckButtonSmall}
                                                    onClick={() =>
                                                        navigate("/flashcards_quiz", {
                                                            state: { deck },
                                                        })
                                                    }
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
                    ))}
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
                                                onClick={() => {
                                                    setDeleteStatus("Deleting Flashcards...");
                                                    handleConfirmDelete();
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
