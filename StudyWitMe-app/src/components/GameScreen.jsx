import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { socket } from '../context/socket';
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import { doc, runTransaction } from "firebase/firestore";
<<<<<<< HEAD
import Avatar from "../components/Avatar";
import FirstPlaceMedal from "../assets/1st-place-medal.svg";
import SecondPlaceMedal from "../assets/2nd-place-medal.svg";
import ThirdPlaceMedal from "../assets/3rd-place-medal.svg";
=======
>>>>>>> origin/backend-website/store-generated-flashcards/Daniel
import "./GameScreen.css";

function GameScreen() {
    const { roomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const BASE_LEVEL_XP = 100;
    const LEVEL_INCREMENT = 25;

    // State
    const [isHost, setIsHost] = useState(location.state?.isHost || false);
    const [players, setPlayers] = useState([]);
    const [gameState, setGameState] = useState('lobby'); // lobby, in=game, game-over
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [scores, setScores] = useState({});
    const [earnedXP, setEarnedXP] = useState(null);

    //Game Logic state
    const [revealedAnswer, setRevealedAnswer] = useState(null);
    const [roundWinner, setRoundWinner] = useState(null);
    const [timer, setTimer] = useState(30);
    const [showTransitionScoreboard, setShowTransitionScoreboard] = useState(false);
    const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);

    // Timer visual circle stuff
    const [visualProgress, setVisualProgress] = useState(0);
    const radius = 25;
    const circumference = 2 * Math.PI * radius;
    const totalTime = 30;
    const timeColor = timer <= 5 ? "#FF5252" : (timer <= 10 ? "#FFC107" : "#416d8e")

    useEffect(() => {
        const targetTime = timer > 0 ? timer - 1 : 0;
        const offset = circumference - (targetTime / totalTime) * circumference;
        setVisualProgress(offset);
    }, [timer, circumference]);

    // timer countdown number
    useEffect(() => {
        if (gameState === 'in-game' && revealedAnswer === null){
            const interval = setInterval(() => {
                setTimer(prevTimer => (prevTimer > 0 ? prevTimer - 1 : 0));
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [gameState, revealedAnswer]);

    //xp calculation functions
    const xpNeededForLevel = (level) => {
        return (BASE_LEVEL_XP * level) + (LEVEL_INCREMENT * Math.max(level - 1, 0));
    };

    const calculateLevelFromXp = (xpTotal) => {
        let level = 1;
        let remainingXp = xpTotal;
        let threshold = xpNeededForLevel(level);

        while (remainingXp >= threshold) {
            remainingXp -= threshold;
            level += 1;
            threshold = xpNeededForLevel(level);
        }

        return level;
    };

    const awardXp = async (xpAmount, didWin = false) => {
        if (!currentUser) return;

        const userRef = doc(db, "users", currentUser.uid);

        try {
            await runTransaction(db, async (transaction) => {
                const userSnap = await transaction.get(userRef);
                const userData = userSnap.exists() ? userSnap.data() : {};
                const currentXp = userData.userXP || 0;
                const currentWins = userData.gamesWon || 0;
                const newTotalXp = currentXp + xpAmount;
                const newLevel = calculateLevelFromXp(newTotalXp);
                const newWins = didWin ? currentWins + 1 : currentWins;

                const updatePayload = {
                    userXP: newTotalXp,
                    userLevel: newLevel
                };

                if (didWin) {
                    updatePayload.gamesWon = newWins;
                }

                transaction.set(userRef, updatePayload, { merge: true });
            });

            setEarnedXP(xpAmount);
        } catch (err) {
            console.error("Error awarding XP:", err);
        }
    };
<<<<<<< HEAD

    const [mySocketId, setMySocketId] = useState(null);

    useEffect(() => {
        setMySocketId(socket.id);
    }, []);
=======
>>>>>>> origin/backend-website/store-generated-flashcards/Daniel

    // listener logic
    useEffect(() => {
        const onUpdatePlayerList = (playerList) => {
            // only update player list if change occurs
            setPlayers(prevPlayers => {
                if(prevPlayers.length !== playerList.length){
                    return playerList;
                }

                return prevPlayers;
            });
        };

        const onGameStarted = () => setGameState('in-game');

        const onNewQuestion = (questionData) => {
            setCurrentQuestion(questionData);
            setRevealedAnswer(null);
            setRoundWinner(null);
            setSelectedOptionIndex(null);
            setTimer(30);
            setGameState('in-game')
            setShowTransitionScoreboard(false);
        };

        const onQuestionResult = (resultData) => {
            setRevealedAnswer(resultData.correctAnswer);
            setScores(resultData.scores);
            setRoundWinner(resultData.winnerId);
            setTimer(0); // manually set timer to zero since server clock ahead by 1 sec

            setTimeout(() => {
                setShowTransitionScoreboard(true);  
            }, 4000) // delay showing scoreboard to allow reveal answer for 4 secs
        };

        const onGameOver = (data) => {
            setScores(data.scores);
            setGameState('game-over');

<<<<<<< HEAD

=======
>>>>>>> origin/backend-website/store-generated-flashcards/Daniel
            if (!isHost) {
                const scoreEntries = Object.entries(data.scores)
                    .filter(([, pts]) => pts > 0)
                    .sort(([, ptsA], [, ptsB]) => ptsB - ptsA);

                const placement = scoreEntries.findIndex(([playerId]) => playerId === socket.id);

                const placementXP = { 0: 100, 1: 75, 2: 60, 3: 50 };
                const baseXP = placementXP[placement] !== undefined ? placementXP[placement] : 40;

                const totalPoints = scoreEntries.reduce((sum, [, pts]) => sum + pts, 0);
                const playerPoints = data.scores[socket.id] || 0;
                const playerPercentage = totalPoints > 0 ? playerPoints / totalPoints : 0;
                const performanceBonus = Math.ceil(playerPercentage * 30);

                const totalXP = baseXP + performanceBonus;
                const didWin = placement === 0;
                awardXp(totalXP, didWin);
            }
        };

        const onNewHost = (newHostID) => {
            if(socket.id === newHostID){
                setIsHost(true);
            }
        };

        const onRoomCLosed = (message) => {
            alert(message);
            navigate('/play'); // redirect back to game menu
        }

        const onGameError = (message) => {
            alert(message);
        }
        
        // Clean up listerners before launching new ones just in case
        socket.off('updatePlayerList');
        socket.off('gameStarted');
        socket.off('newQuestion');
        socket.off('questionResult');
        socket.off('gameOver');
        socket.off('newHost');
        socket.off('roomClosed');
        socket.off('gameError');

        socket.on('updatePlayerList', onUpdatePlayerList);
        socket.on('gameStarted', onGameStarted);
        socket.on('newQuestion', onNewQuestion);
        socket.on('questionResult', onQuestionResult);
        socket.on('gameOver', onGameOver);
        socket.on('newHost', onNewHost);
        socket.on('roomClosed', onRoomCLosed);
        socket.on('gameError', onGameError);

        // request server for player list after game created in case of race conditon
        socket.emit('getInitialData', roomCode);

        return () => {
            socket.off('updatePlayerList', onUpdatePlayerList);
            socket.off('gameStarted', onGameStarted);
            socket.off('newQuestion', onNewQuestion);
            socket.off('questionResult', onQuestionResult);
            socket.off('gameOver', onGameOver);
            socket.off('newHost', onNewHost);
            socket.off('roomClosed', onRoomCLosed);
            socket.off('gameError', onGameError);
        }

    }, [navigate, roomCode]);
<<<<<<< HEAD

    const handleLeaveRoom = () => {
        socket.emit("leaveRoom", roomCode);
        navigate("/play");
    };

    const handleCloseRoom = () => {
        socket.emit("closeRoom", roomCode);
        navigate("/play");
    };
=======
>>>>>>> origin/backend-website/store-generated-flashcards/Daniel

    const handleStartGame = () => {
        socket.emit('startGame', roomCode);
    };

    const handleAnswer = (index) => {
        if (revealedAnswer !== null || selectedOptionIndex !== null){
            return;
        }

        setSelectedOptionIndex(index);

        socket.emit('submitAnswer', {roomCode, answerIndex: index});
    };

    const handleRestart = () => {
        socket.emit('restartGame', roomCode);
    }

    const renderHostLobby = () => (
        <div className="host-lobby-overlay">
            <div className="host-lobby-container">
                <h1>Room Code: <span>{roomCode}</span></h1>
                <button onClick={handleCloseRoom} className="close-room-btn">
                    Close Room
                </button>
                <div className="player-display">
                    <p>Players ({players.length}/4):</p>
                    <ul className="player-list">
                        {players.map((player) => (
<<<<<<< HEAD
                            <li key={player.id} className="player-list-item">
                                <div className="player-identity">
                                    <Avatar avatar={player.avatar} size={32} />
                                    <span className="player-name">{player.name}</span>
                                </div>

                                <span className="player-level">
                                    Lv. {player.userLevel ?? 1}
                                </span>
                            </li>
=======
                            <li key={player.id}>{player.name}</li>
>>>>>>> origin/backend-website/store-generated-flashcards/Daniel
                        ))}
                    </ul>
                </div>
                <button className="host-lobby-start-game-btn" onClick={handleStartGame}>
                    Start Game
                </button>
            </div>
        </div>
    );

    const renderPlayerLobby = () => (
        <div className="join-lobby-overlay">
            <div className="join-lobby-container">
                <h1>Room Code: {roomCode}</h1>
                <p>Waiting for host to start the game...</p>
<<<<<<< HEAD
                <button onClick={handleLeaveRoom} className="leave-room-btn">
                    Leave Room
                </button>
=======
>>>>>>> origin/backend-website/store-generated-flashcards/Daniel
            </div>
        </div>
    );

    const renderHostGameView = () =>{
        if(showTransitionScoreboard){
            return renderTransitionScoreboard();
        }

        return(
            <div className="game-host-overlay">
                <div className="game-host-container">
                    <div className="game-host-main">
                        {currentQuestion && ((
                            <>  
                                <div className="game-host-header">
                                    <div className="game-host-time-container">
                                        <svg className="timer-svg" width="100" height="100" viewBox="0 0 100 100">
                                            <circle
                                                className="timer-circle-bg"
                                                cx="50" cy="50" r={radius}
                                            />
                                            <circle
                                                className="timer-circle-progress"
                                                cx="50" cy="50" r={radius}
                                                stroke={timeColor}
                                                strokeDasharray={circumference}
                                                strokeDashoffset={visualProgress}
                                                transform="rotate(-90 50 50)"
                                            />
                                            <text
                                                x="50" y="50"
                                                className="timer-text"
                                                dominantBaseline="central"
                                                textAnchor="middle"
                                            >
                                                {timer}
                                            </text>
                                        </svg>
                                    </div>
                                    <h3 className="game-host-q-number">Question {currentQuestion.questionNumber}/{currentQuestion.totalQuestions}</h3>
                                </div>

                                <h2 className="game-host-q-text">{currentQuestion.question}</h2>

                                <div className="game-host-options-grid">
                                    {currentQuestion.options.map((option, index) => {
                                        const isRoundOver = revealedAnswer !== null;
                                        const isCorrect = option === revealedAnswer;

                                        let buttonClass = 'host-option-display'
                                        
                                        if(isRoundOver){
                                            if(isCorrect){
                                                buttonClass += ' correct-reveal';
                                            }
                                            else{
                                                buttonClass += ' dimmed';
                                            }
                                        }

                                        return(
                                            <div key={index} className={buttonClass}>
                                                {option}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="host-game-result-message">
                                    {revealedAnswer ?(
                                        <div className="correct-answer-reveal">
                                            <p className="winner-text">
                                                {roundWinner
                                                    ? `${players.find(p => p.id === roundWinner)?.name || 'Someone'} got it right!`
                                                    : "Times up! No one got it."}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="waiting-text">Waiting for players...</p>
                                    )}
                                </div>
                            </>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderTransitionScoreboard = () => {
        const sortedPlayers = [...players].sort((a,b) => (scores[b.id] || 0) - (scores[a.id] || 0)); 
        return (
            <div className="game-host-overlay">
                <div className="transition-scoreboard-container">
                    <h2>Scoreboard</h2>
                    <div className="scoreboard-list">
                        <ol>
                            {sortedPlayers.map((player) => (
                                <li key={player.id}>
                                    <span className="player-name">{player.name}</span>
                                    <span className="player-score">{scores[player.id] || 0}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
            </div>
        );
    };

    const renderPlayerGameView = () => (
        <div className="player-trivia-screen-overlay">
            <div className="player-trivia-screen-container">
                {!currentQuestion ? <p className="player-trivia-waiting-text">Waiting for question...</p> : (
                    <>
                        <h3 className="player-trivia-status-title">
                            {revealedAnswer !==null ? "Round Over!" : "Choose an answer"}
                        </h3>
                        
                        <div className="player-trivia-options-grid">
                            {currentQuestion.options.map((option, index) => {
                                let buttonClass = 'player-option-btn';
                                
                                if(revealedAnswer !== null ){
                                    if(option === revealedAnswer){
                                        buttonClass += ' correct';
                                    }
                                    else if(selectedOptionIndex === index){
                                        buttonClass += ' incorrect';
                                    }
                                    else {
                                        buttonClass += ' dimmed';
                                    }
                                }
                                else if(selectedOptionIndex === index){
<<<<<<< HEAD
                                    buttonClass += ' selected';
=======
                                  buttonClass += ' selected';
>>>>>>> origin/backend-website/store-generated-flashcards/Daniel
                                }

                                return (
                                    <button
                                        key={index}
                                        onClick={() => handleAnswer(index)}
                                        disabled={revealedAnswer !== null || selectedOptionIndex !== null}
                                        className={buttonClass}
                                    >
                                        {option}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="player-trivia-result-message">
                            {revealedAnswer !== null && (
                                <div>
                                    {roundWinner === socket.id ?(
                                        <p>You won!</p>
                                    ) : (
                                        <p>{roundWinner ? "Someone else was faster!" : "Time's up!"}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    const renderGameOver = () => {
        const sortedPlayers = [...players].sort((a,b) => (scores[b.id] || 0) - (scores[a.id]||0));

        return (
            <div className="gameover-screen-overlay">
                <div className="gameover-screen-container">
                    <h1>Game Over!</h1>
                    {earnedXP !== null && (
                        <div style={{ textAlign: 'center', margin: '10px 0', fontSize: '1.2rem', color: '#4CAF50', fontWeight: 'bold' }}>
                            +{earnedXP} XP Earned!
                        </div>
                    )}
                    <div className="gameover-screen-scoreboard">
                        <h2>Final Scores:</h2>
                        <ol>
<<<<<<< HEAD
                            {sortedPlayers.map((player, index) => {
                                const isMe = player.id === socket.id;

                                const medalSrc =
                                    index === 0 ? FirstPlaceMedal :
                                    index === 1 ? SecondPlaceMedal :
                                    index === 2 ? ThirdPlaceMedal :
                                    null;

                                return (
                                    <li
                                        key={player.id}
                                        className={isMe ? "is-me" : ""}
                                    >
                                        <div className="gameover-player-row">
                                            {medalSrc && (
                                                <img
                                                    src={medalSrc}
                                                    alt={`Place ${index + 1}`}
                                                    className="placement-medal"
                                                />
                                            )}

                                            <div className="gameover-player-block">
                                                <div className="player-identity">
                                                    <Avatar avatar={player.avatar} size={40} />
                                                    <span className="player-name">
                                                        {player.name}
                                                    </span>
                                                </div>

                                                <span className="player-score">
                                                    {scores[player.id] || 0} pts
                                                </span>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
=======
                            {sortedPlayers.map((player) => (
                                <li>
                                    {player.id === socket.id ? `You (${player.name})`: player.name}: {scores[player.id] || 0} points
                                </li>
                            ))}
>>>>>>> origin/backend-website/store-generated-flashcards/Daniel
                        </ol>
                    </div>
                    {isHost ? (
                        <div className="gameover-controls">
                            <button className="gameover-replay-btn" onClick={handleRestart}>
                                Play Again
                            </button>
<<<<<<< HEAD
=======
                            <button className="gameover-host-deck-btn" >
                                Choose Another Deck
                            </button>
>>>>>>> origin/backend-website/store-generated-flashcards/Daniel
                            <button className="gameover-main-menu-btn" onClick={() => navigate("/main")}>
                                Main Menu
                            </button>
                        </div>
                    ):(
                        <div className="gameover-controls">
                            <button className="gameover-main-menu-btn" onClick={() => navigate("/main")}>
                                Main Menu
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );  
    }

    const renderGameState = () => {
        switch (gameState) {
            case 'in-game': return isHost ? renderHostGameView() : renderPlayerGameView();
            case 'game-over': return renderGameOver();
            default: return isHost ? renderHostLobby() : renderPlayerLobby();
        }
    };

    return(
        <div>
            {renderGameState()}
        </div>
    );
};

export default GameScreen;