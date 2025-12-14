import {useState, useEffect, useRef} from "react";
import { useNavigate, Link } from "react-router-dom";
import { socket } from "../context/socket";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useDecks } from "../context/DecksContext";
import styles from "./Flashcards.module.css";
import "./Play.css";
import home from "../assets/home.svg";

function Play() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [mode, setMode] = useState('menu');
    const [isLoading, setIsLoading] = useState(false);
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [showLoginPrompt, setLoginPrompt] = useState(false);

    //no longer looking each load, just checks cache
    const { decks, loadingDecks, deckCounts } = useDecks(); 
    const categories = Array.from(
        new Set((decks || []).map((d) => d.category || "Uncategorized"))
    ).sort();

    const [filteredDecks, setFilteredDecks] = useState([]);
    const [sortOption, setSortOption] = useState("category");

    // Filter state
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [showFilter, setShowFilter] = useState(false);
    const filterRef = useRef(null);
    const didInitCategoriesRef = useRef(false);
    const [guestName, setGuestName] = useState('');
    const [displayName, setDisplayName] = useState('');

    useEffect(() => {
        if(!currentUser){
            setDisplayName('');
            return;
        }

        const fetchUserProfile = async () => {
            try {
                const userDocRef = doc(db, "users", currentUser.uid);
                const userSnapshot = await getDoc(userDocRef);
                
                if (userSnapshot.exists()){
                    setDisplayName(userSnapshot.data().displayName);
                }
            } catch (err){
                console.error("Error fetching profile:", err);
            }
        };
        fetchUserProfile();
    }, [currentUser]);


    // Initialize default categories on first load
    useEffect(() => {
        if (!didInitCategoriesRef.current && categories.length > 0) {
            setSelectedCategories(categories);
            didInitCategoriesRef.current = true;
        }
    }, [categories]);

    //Apply sort & filtering to cached decks
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

    useEffect(() => {
        const onGameCreated = (newRoomCode) => {
            navigate(`/game/${newRoomCode}`, { state : {isHost: true}})
        };

        const onJoinSuccess = (joinedRoomCode) => {
            navigate(`/game/${joinedRoomCode}`, { state: {isHost: false}})
        }

        const onJoinError = (message) => {
            setIsLoading(false);
            setError(message);
        }

        socket.on('gameCreated', onGameCreated);
        socket.on('joinSuccess', onJoinSuccess);
        socket.on('joinError', onJoinError);

        return () => {
            socket.off('gameCreated', onGameCreated);
            socket.off('joinSuccess', onJoinSuccess);
            socket.off('joinError', onJoinError);
        }
    }, [navigate]);

    const handleHostGame = (deckId) => {
        if(!currentUser) {
            setLoginPrompt(true);
            return;
        }

        setIsLoading(true);
        socket.emit('createGame', deckId);
    }

    const handleShowChooseDeck = () => {
        setMode('choosing-deck')
    }

    const handleShowJoinMenu = () => {
        setMode('joining');
    };

    const handleJoinGame = () => {
        setError('');
        
        const cleanRoomCode = roomCode.trim().toUpperCase();
        
        if(!cleanRoomCode){
            setError('Please enter room code.')
            return;
        }

        let finalName = "";

        if(currentUser){
            finalName = displayName;
        }
        else{
            finalName = guestName.trim();
            if(!finalName){
                setError('Please enter a username.')
                return;
            }
        }

        setIsLoading(true);
        socket.emit('joinGame', {roomCode: cleanRoomCode, playerName: finalName});
    }

    const handleBackToMenu = () => {
        setMode('menu');
        setError('');
        setRoomCode('');
    };

    // Toggle a single category
    const toggleCategory = (cat) => {
        setSelectedCategories((prev) =>
            prev.includes(cat)
                ? prev.filter((c) => c !== cat)
                : [...prev, cat]
        );
    };

    // Select all categories
    const handleSelectAll = () => {
        setSelectedCategories(categories);
    };

    // Clear all categories
    const handleClearFilter = () => {
        setSelectedCategories([]);
    };

    if (showLoginPrompt){
        return (
            <div className="login-prompt-overlay">
                <div className="login-prompt-box">
                    <button className="login-prompt-close-btn" onClick={() => setLoginPrompt(false)}>&times;</button>
                    <div className="login-prompt-content">
                        <h2>Oops, you're not signed in</h2>
                        <p>
                            Please <Link to="/login">sign in</Link> to host a game.
                        </p>
                    </div>
                </div>
            </div>
        )
    }
        

    if (isLoading) {
        return (
            <div>
                <h1>Creating / Joining Game...</h1>
            </div>
        );
    }

    if (mode === 'choosing-deck'){
        return(
            <div className={styles.overlay}>
                <div className={styles.stickyToolbar}>
                    <div className={styles.deckToolbar}>
                        <div className={styles.toolbarLeft}>
                            <button className={styles.backbutton} onClick={handleBackToMenu}>
                                Back
                            </button>
                        </div>
                        <h3 className={styles.toolbarTitle}>Choose a Deck to Host</h3>
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
                    <div className={styles.flashcardGallery}>
                        <div className={styles.categoryGrid}>
                            {decks.length    > 0 ?(
                                filteredDecks.map((deck) => (
                                    <div key={deck.id} className={styles.deckCard}>
                                        <div className={styles.deckMeta}>
                                            <div className={styles.deckCardContent}>
                                                <h3>{deck.title || "Untitled Deck"}</h3>
                                                <p>Cards: {deckCounts[deck.id] || 0}</p>
                                            </div>
                                        </div>
                                        <div className={styles.deckButtons}>
                                            <button className={styles.deckButtonSmall} onClick={() => handleHostGame(deck.id)}>
                                                Host this Deck
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div>
                                    <h2>No decks Found</h2>
                                    <p>Create a deck first to host a game</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (mode === 'joining') {
        return (
            <>
                <div className="join-screen-overlay">
                    <div className="join-screen-box">
                        <button className="join-screen-back-btn" onClick={handleBackToMenu}>&times;</button>

                        <div className="join-body-grid">
                            <label className="join-label">Room Code:</label>
                            <input
                                placeholder="Enter Room Code"
                                type="text"
                                value={roomCode}
                                onChange={(e) => setRoomCode(e.target.value)}
                                className="join-input"
                            />
                            {!currentUser && (
                                <>
                                    <label className="join-label">Username:</label>       
                                    <input
                                        placeholder="Enter Guest Username"
                                        type="text"
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        className="join-input"
                                    />
                                </>  
                            )}
                        </div>

                        <div className="join-footer">
                            <div className="join-status-text">
                                {currentUser && (
                                    <p className="join-display-name">
                                        Joining as: <strong>{displayName}</strong>
                                    </p>
                                )}
                            </div>
                            <button className="join-action-btn" onClick={handleJoinGame}>
                                Join
                            </button>
                        </div>

                        {error && <p className="join-error-text">{error}</p>}
                    </div>
                </div>
            </>
        );
    }

    return (
        <> 
            <div className="menu-overlay"> 
                <div className="menu-button-box">
                    <img
                        src={home}
                        alt="Home"
                        className="home"
                        onClick={() => navigate("/main")}
                        title="Home"
                    />
                    <button onClick={handleShowChooseDeck}>Host Game</button>
                    <button onClick={handleShowJoinMenu}>Join Game</button>
                </div>
            </div>
        </>
    );

}

export default Play;