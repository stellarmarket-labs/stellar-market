"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { io, Socket } from "socket.io-client";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";
const TOKEN_KEY = "stellarmarket_jwt";

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

    if (!token) return;
    if (socketRef.current?.connected) return;

    const socket = io(BACKEND_URL, {
      auth: { token },
      transports: ["websocket"],
      autoConnect: true,
    });

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
      setIsConnected(false);
    });

    socketRef.current = socket;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
