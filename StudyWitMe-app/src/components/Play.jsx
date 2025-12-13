import React, {useState, useEffect} from "react";
import { useNavigate, Link } from "react-router-dom";
import { socket } from "../context/socket";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, onSnapshot, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import styles from "./Flashcards.module.css";
import "./Play.css";

function Play() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [decks, setDecks] = useState([]);
    const [deckCounts, setDeckCounts] = useState({});
    const [mode, setMode] = useState('menu');
    const [isLoading, setIsLoading] = useState(false);
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [showLoginPrompt, setLoginPrompt] = useState(false);
    const [guestName, setGuestName] = useState('');
    const [displayName, setDisplayName] = useState('');

    useEffect(() => {
        if(!currentUser){
            setDecks([])
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
        
        const decksCollectionRef = collection(db, "deck");
        const q = query(decksCollectionRef, where("ownerId", "==", currentUser.uid));

        const unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
                const userDecks = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                setDecks(userDecks);

                const counts = {};
                const flashcardsCollectionRef = collection(db, "flashcard");
                for (const deck of userDecks){
                    const cardQuery = query(flashcardsCollectionRef, where("deckId", "==", deck.id), where("ownerId", "==", currentUser.uid));
                    const cardSnapshot = await getDocs(cardQuery);
                    counts[deck.id] = cardSnapshot.size;
                }
                setDeckCounts(counts);
            },
            (error) => {
                console.error("error fetching cards", error);
            }
        );

        return() => unsubscribe();
    }, [currentUser]);

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

        const onGameError = (message) => {
            alert(message);
        }

        socket.on('gameCreated', onGameCreated);
        socket.on('joinSuccess', onJoinSuccess);
        socket.on('joinError', onJoinError);
        socket.on('gameError', onGameError);
    

        return () => {
            socket.off('gameCreated', onGameCreated);
            socket.off('joinSuccess', onJoinSuccess);
            socket.off('joinError', onJoinError);
            socket.off('gameError', onGameError);
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
        if(!currentUser) {
            setLoginPrompt(true);
            return;
        }

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
                        <h1 className={styles.toolbarTitle}>Choose a Deck to Host</h1>
                        <div className={styles.tollbarRight}></div>
                    </div>
                </div>
                <div className={styles.menuBackdrop}>
                    <div >
                        <div className={styles.categoryGrid}>
                            {decks.length    > 0 ?(
                                decks.map((deck) => (
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
                        <div className="join-screen-contents">
                            <input
                                placeholder="Enter Room Code"
                                type="text"
                                value={roomCode}
                                onChange={(e) => setRoomCode(e.target.value)}
                                className="join-input"
                            />
                            {!currentUser && (
                                <input
                                    placeholder="Enter Guest Username"
                                    type="text"
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                    className="join-input"
                                />
                            )}
                            {currentUser && (
                                <p className="join-display-name">
                                    Joining as: <strong>{displayName}</strong>
                                </p>
                            )}
                            <button onClick={handleJoinGame}>
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
                    <button onClick={handleShowChooseDeck}>Host Game</button>
                    <button onClick={handleShowJoinMenu}>Join Game</button>
                </div>
            </div>
        </>
    );

}

export default Play;