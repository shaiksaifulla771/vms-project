import { useEffect, useState, useRef } from 'react';
import api from '../services/api';

/**
 * useSSE hook for secure, short-lived token based Server-Sent Events
 * @param {Object} eventHandlers - Map of event names to handler functions { 'INVENTORY_RECEIVED': (payload) => {} }
 */
const useSSE = (eventHandlers = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef(null);
  const handlersRef = useRef(eventHandlers);

  // Keep handlers fresh without causing reconnects
  useEffect(() => {
    handlersRef.current = eventHandlers;
  }, [eventHandlers]);

  useEffect(() => {
    let source;
    let isActive = true;

    const connectSSE = async () => {
      try {
        // 1. Request one-time connection token via authenticated API
        const response = await api.post('/stream/token');
        const token = response.data?.token;

        if (!token || !isActive) return;

        // 2. Establish EventSource with the short-lived token
        const baseURL = import.meta.env.VITE_API_URL || '/api';
        source = new EventSource(`${baseURL}/stream?token=${token}`);
        eventSourceRef.current = source;

        source.onopen = () => {
          setIsConnected(true);
        };

        source.onerror = (err) => {
          console.error('[SSE] Connection error', err);
          setIsConnected(false);
          source.close();
          
          // Basic exponential backoff could be implemented here
          setTimeout(() => {
            if (isActive && !isConnected) {
              connectSSE();
            }
          }, 5000);
        };

        // 3. Bind dynamic event handlers
        const boundEvents = Object.keys(handlersRef.current);
        
        boundEvents.forEach(eventName => {
          source.addEventListener(eventName, (e) => {
            try {
              const payload = JSON.parse(e.data);
              if (handlersRef.current[eventName]) {
                handlersRef.current[eventName](payload);
              }
            } catch (parseErr) {
              console.error('[SSE] Failed to parse event payload', parseErr);
            }
          });
        });

      } catch (err) {
        console.error('[SSE] Failed to retrieve connection token', err);
        setIsConnected(false);
      }
    };

    connectSSE();

    return () => {
      isActive = false;
      if (source) {
        source.close();
      }
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Reconnect manually or on unmount

  return { isConnected };
};

export default useSSE;
