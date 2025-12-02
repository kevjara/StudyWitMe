import {useState, useEffect} from "react";
import { useNavigate, Link } from "react-router-dom";
import { socket } from "../context/socket";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import styles from "./Flashcards.module.css";
import "./Play.css";
import home from "../assets/home.svg";

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

    useEffect(() => {
        if(!currentUser){
            setDecks([])
            return;
        }
        
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
        if(roomCode.trim()){
            setIsLoading(true);
            socket.emit('joinGame', roomCode.toUpperCase());
        }
        else{
            setError('Please enter a room code.')
        }
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
                        <div className={styles.toolbarRight}></div>
                    </div>
                </div>
                <div className={styles.menuBackdrop}>
                    <div className={styles.flashcardGallery}>
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
                            />
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
                <img
                    src={home}
                    alt="Home"
                    className="home"
                    onClick={() => navigate("/main")}
                    title="Home"
                />
                <div className="menu-button-box">
                    <button onClick={handleShowChooseDeck}>Host Game</button>
                    <button onClick={handleShowJoinMenu}>Join Game</button>
                </div>
            </div>
        </>
    );

}

export default Play;