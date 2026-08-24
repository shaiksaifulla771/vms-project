import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../services/api';

/**
 * useSocket hook for secure WebSocket integration
 * @param {Object} eventHandlers - Map of event names to handler functions { 'INVENTORY_RECEIVED': (payload) => {} }
 */
const useSocket = (eventHandlers = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const handlersRef = useRef(eventHandlers);

  useEffect(() => {
    handlersRef.current = eventHandlers;
  }, [eventHandlers]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const baseURL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:5000';
    
    const socket = io(baseURL, {
      auth: { token },
      withCredentials: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10
    });

    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', (err) => console.error('[WS] Connection error', err.message));

    // Listen to all events generically and route to handlers if defined
    // We can use socket.onAny to capture events broadcasted without specific bindings
    socket.onAny((eventName, ...args) => {
      if (handlersRef.current[eventName]) {
        handlersRef.current[eventName](args[0]);
      }
    });

    return () => {
      socket.disconnect();
      setIsConnected(false);
    };
  }, []);

  return { isConnected, socket: socketRef.current };
};

export default useSocket;
