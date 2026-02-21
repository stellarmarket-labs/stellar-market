"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  isConnected as freighterIsConnected,
  requestAccess,
  getAddress,
} from "@stellar/freighter-api";

interface WalletState {
  address: string | null;
  isConnecting: boolean;
  isFreighterInstalled: boolean | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

const STORAGE_KEY = "stellarmarket_wallet_connected";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export { truncateAddress };

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFreighterInstalled, setIsFreighterInstalled] = useState<
    boolean | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const checkFreighterInstalled = useCallback(async () => {
    try {
      const result = await freighterIsConnected();
      if (result.error) {
        setIsFreighterInstalled(false);
        return false;
      }
      setIsFreighterInstalled(result.isConnected);
      return result.isConnected;
    } catch {
      setIsFreighterInstalled(false);
      return false;
    }
  }, []);

  const restoreSession = useCallback(async () => {
    const wasConnected = localStorage.getItem(STORAGE_KEY);
    if (wasConnected !== "true") return;

    const installed = await checkFreighterInstalled();
    if (!installed) return;

    try {
      const result = await getAddress();
      if (result.error) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setAddress(result.address);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [checkFreighterInstalled]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const connect = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const installed = await checkFreighterInstalled();
      if (!installed) {
        setError(
          "Freighter wallet extension not found. Please install it from https://freighter.app"
        );
        setIsConnecting(false);
        return;
      }

      const accessResult = await requestAccess();
      if (accessResult.error) {
        setError(accessResult.error.message ?? "Failed to connect wallet");
        setIsConnecting(false);
        return;
      }

      const addressResult = await getAddress();
      if (addressResult.error) {
        setError(addressResult.error.message ?? "Failed to retrieve address");
        setIsConnecting(false);
        return;
      }

      setAddress(addressResult.address);
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      setError("An unexpected error occurred while connecting the wallet");
    } finally {
      setIsConnecting(false);
    }
  }, [checkFreighterInstalled]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      isConnecting,
      isFreighterInstalled,
      error,
      connect,
      disconnect,
    }),
    [address, isConnecting, isFreighterInstalled, error, connect, disconnect]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
