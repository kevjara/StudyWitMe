import React, {useState, useEffect, use} from "react";
import { useNavigate, Link } from "react-router-dom";
import { socket } from "../context/socket";
import { useAuth } from "../context/AuthContext";

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
            <div>
                <div>
                    <h2>Oops, you're not signed in</h2>
                    <p>
                        Please <Link to="/login">sign in</Link> to host a game.
                    </p>
                    <button onClick={() => setLoginPrompt(false)}>X</button>
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
                <div>
                    <button onClick={handleBackToMenu}>Back</button>
                    <input
                        placeholder="Enter Room Code"
                        type="text"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value)}
                    />
                    <button onClick={handleJoinGame}>
                        Join
                    </button>
                    {error && <p>{error}</p>}
                </div>
            </>
        );
    }

    return (
        <>  
            <div>
                <button onClick={handleHostGame}>Host Game</button>
                <button onClick={handleShowJoinMenu}>Join Game</button>
            </div>
        </>
    );

}

export default Play;