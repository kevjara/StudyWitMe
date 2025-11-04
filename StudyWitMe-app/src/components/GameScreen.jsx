import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { socket } from '../context/socket';
import "./GameScreen.css";

function GameScreen() {
    const { roomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [isHost, setIsHost] = useState(location.state?.isHost || false);
    const [players, setPlayers] = useState([]);
    const [gameState, setGameState] = useState('lobby'); // lobby, in=game, game-over
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [scores, setScores] = useState({});
    const [correctAnswerIndex, setCorrectAnswerIndex] = useState(null);
    const [roundWinner, setRoundWinner] = useState(null);
    const [timer, setTimer] = useState(30);
    const [selectedAnswer, setSelectedAnswer] = useState(null);

    // timer countdown
    useEffect(() => {
        if (gameState === 'in-game' && correctAnswerIndex === null){
            const interval = setInterval(() => {
                setTimer(prevTimer => (prevTimer > 0 ? prevTimer - 1 : 0));
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [gameState, correctAnswerIndex]);

    // listener logic
    useEffect(() => {
        const onUpdatePlayerList = (playerList) => setPlayers(playerList);
        const onGameStarted = () => setGameState('in-game');

        const onNewQuestion = (questionData) => {
            setCurrentQuestion(questionData);
            setCorrectAnswerIndex(null);
            setRoundWinner(null);
            setSelectedAnswer(null);
            setTimer(30);
            setGameState('in-game')
        };

        const onQuestionResult = (resultData) => {
            setCorrectAnswerIndex(resultData.correctAnswerIndex);
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

    }, [navigate]);

    const handleStartGame = () => {
        socket.emit('startGame', roomCode);
    };

    const handleAnswer = (answerIndex) => {
        if(correctAnswerIndex === null){
            setSelectedAnswer(answerIndex);
            socket.emit('submitAnswer', {roomCode, answerIndex});
        }
    };

    const HostLobby = () => (
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

    const PlayerLobby = () => (
        <div className="join-lobby-overlay">
            <div className="join-lobby-container">
                <h1>Room Code: {roomCode}</h1>
                <p>Waiting for host to start the game...</p>
            </div>
        </div>
    )

    const HostGameView = () => (
        <div className="game-host-overlay">
            <div className="game-host-container">
                <div className="game-host-main">
                    {currentQuestion && ((
                        <>
                            <div className="game-host-timer">Time remaining: {timer} </div>
                            <h3 className="game-host-q-number">Question {currentQuestion.questionNumber}/{currentQuestion.totalQuestions}</h3>
                            <h2 className="game-host-q-text">{currentQuestion.question}</h2>
                            <div className="game-host-options-grid">
                                {currentQuestion.options.map((option, index) => {
                                    let buttonClass = '';
                                    const isRoundOver = correctAnswerIndex !== null;

                                    if (isRoundOver){
                                        buttonClass = index === correctAnswerIndex ? 'correct' : 'incorrect';
                                    } else if (selectedAnswer === index ){
                                        buttonClass = 'selected';
                                    }

                                    return(
                                        <button
                                            //display only buttons
                                            key={index}
                                            className={buttonClass}
                                        >
                                            {option}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="host-game-result-message">
                                {correctAnswerIndex !== null && (
                                    <div>
                                        {roundWinner ?(
                                            <p>{roundWinner === socket.id ? 'you got it correct' : `${roundWinner.substring(0,5)}... was first!`}</p>
                                        ) : (
                                            <p>Times up</p>
                                        )}
                                    </div>
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

    const PlayerGameView = () => (
        <div className="player-trivia-screen-overlay">
            <div className="player-trivia-screen-container">
                {!currentQuestion ? <p className="player-trivia-waiting-text">Waiting for question...</p> : (
                    <>
                        <h3 className="player-trivia-status-title">{correctAnswerIndex !==null ? "Round Over!" : "Choose an answer"}</h3>
                        <div className="player-trivia-options-grid">
                            {currentQuestion.options.map((option, index) => {
                                let buttonClass = '';
                                const isRoundOver = correctAnswerIndex !== null;

                                if(isRoundOver){
                                    buttonClass = index === correctAnswerIndex ? 'correct' : 'incorrect';
                                }
                                else if (selectedAnswer === index){
                                    buttonClass = 'selected';
                                }

                                return (
                                    <button
                                        key={index}
                                        onClick={() => handleAnswer(index)}
                                        disabled={isRoundOver}
                                        className={buttonClass}
                                    >
                                        {option}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="player-trivia-result-message">
                            {correctAnswerIndex !== null && (
                                <div>
                                    {roundWinner ?(
                                        <p>{roundWinner === socket.id ? 'You got it correct' : 'someone else was first'}</p>
                                    ) : (
                                        <p>Time's up</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    const GameOver = () => {
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
            case 'in-game': return isHost ? <HostGameView/> : <PlayerGameView/>;
            case 'game-over': return <GameOver/>;
            default: return isHost ? <HostLobby/> : <PlayerLobby/>;
        }
    };

    return(
        <div>
            {renderGameState()}
        </div>
    );
};

export default GameScreen;