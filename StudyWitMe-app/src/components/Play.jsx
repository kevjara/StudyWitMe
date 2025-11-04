import React, {useState, useEffect, use} from "react";
import { useNavigate, Link } from "react-router-dom";
import { socket } from "../context/socket";
import { useAuth } from "../context/AuthContext";
import "./Play.css";

function Play() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [mode, setMode] = useState('menu');
    const [isLoading, setIsLoading] = useState(false);
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [showLoginPrompt, setLoginPrompt] = useState(false);

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

    const handleHostGame = () => {
        if(!currentUser) {
            setLoginPrompt(true);
            return;
        }

        setIsLoading(true);
        socket.emit('createGame');
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
                <div className="menu-button-box">
                    <button onClick={handleHostGame}>Host Game</button>
                    <button onClick={handleShowJoinMenu}>Join Game</button>
                </div>
            </div>
        </>
    );

}

export default Play;