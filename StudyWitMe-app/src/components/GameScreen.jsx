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

    const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);

    // timer countdown
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
        };

        const onQuestionResult = (resultData) => {
            setRevealedAnswer(resultData.correctAnswer);
            setScores(resultData.scores);
            setRoundWinner(resultData.winnerId);
            setTimer(0); // manually set timer to zero since server clock ahead by 1 sec
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
            navigate('/main'); // redirect back to main menu
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

    const renderHostLobby = () => (
        <div className="host-lobby-overlay">
            <div className="host-lobby-container">
                <h1>Room Code: <span>{roomCode}</span></h1>
                <div className="player-display">
                    <p>Players ({players.length}):</p>
                    <ul>
                        {players.map((player) => (
                            <li key={player.id}>{player.id.substring(0,5)}</li>
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
            </div>
        </div>
    )

    const renderHostGameView = () => (
        <div className="game-host-overlay">
            <div className="game-host-container">
                <div className="game-host-main">
                    {currentQuestion && ((
                        <>  
                            <div className="game-host-header">
                                <div className="game-host-timer">Time remaining: {timer} </div>
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
                                                ? `${roundWinner.substring(0,5)} got it right!`
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

                <div className="game-host-scoreboard">
                    <h4>Scores:</h4>
                    <ul>
                        {players.map(player => (
                            <li key={player.id}>
                                {player.id.substring(0,5)}: {scores[player.id] || 0}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );

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
                                    {player.id === socket.id ? `You` : player.id.substring(0,5)}: {scores[player.id] || 0} points
                                </li>
                            ))}
                        </ol>
                    </div>
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