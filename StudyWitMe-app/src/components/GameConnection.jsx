import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { socket } from '../context/socket'

function GameLayout() {
    useEffect(() => {
        socket.connect();

        socket.on('connect', () => console.log('Socket connected'));
        socket.on('disconnect', () => console.log('Socket disconnected'));

        return () => {
        socket.off('connect');
        socket.off('disconnect');
        socket.disconnect();
        };
    }, []);

    return <Outlet/>
}

export default GameLayout;