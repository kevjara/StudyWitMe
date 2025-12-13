import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { socket } from '../context/socket';
import "./GameScreen.css";

function GameScreen() {
    const { roomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    // State
    const [isHost, setIsHost] = useState(location.state?.isHost || false);
    const [players, setPlayers] = useState([]);
    const [gameState, setGameState] = useState('lobby'); // lobby, in=game, game-over
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [scores, setScores] = useState({});

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

        socket.on('updatePlayerList', onUpdatePlayerList);
        socket.on('gameStarted', onGameStarted);
        socket.on('newQuestion', onNewQuestion);
        socket.on('questionResult', onQuestionResult);
        socket.on('gameOver', onGameOver);
        socket.on('newHost', onNewHost);
        socket.on('roomClosed', onRoomCLosed);

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
        }

    }, [navigate, roomCode]);

    const handleLeaveRoom = () => {
        socket.emit("leaveRoom", roomCode);
        navigate("/play");
    };

    const handleCloseRoom = () => {
        socket.emit("closeRoom", roomCode);
        navigate("/play");
    };

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
                    <p>Players ({players.length}):</p>
                    <ul>
                        {players.map((player) => (
                            <li key={player.id}>{player.name}</li>
                        ))}
                    </ul>
                </div>
                <button className="host-lobby-start-game-btn" onClick={handleStartGame} disabled={players.length < 1}>
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
                <button onClick={handleLeaveRoom} className="leave-room-btn">
                    Leave Room
                </button>
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
                                  buttonClass += ' selected';
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
                    <div className="gameover-screen-scoreboard">
                        <h2>Final Scores:</h2>
                        <ol>
                            {sortedPlayers.map((player) => (
                                <li>
                                    {player.id === socket.id ? `You (${player.name})`: player.name}: {scores[player.id] || 0} points
                                </li>
                            ))}
                        </ol>
                    </div>
                    {isHost ? (
                        <div className="gameover-controls">
                            <button className="gameover-replay-btn" onClick={handleRestart}>
                                Play Again
                            </button>
                            <button className="gameover-host-deck-btn" >
                                Choose Another Deck
                            </button>
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