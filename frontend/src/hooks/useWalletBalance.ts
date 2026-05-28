"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Horizon } from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const REFRESH_INTERVAL_MS = 60_000;

export interface WalletBalance {
  asset: string;
  balance: string;
}

export interface UseWalletBalanceResult {
  balances: WalletBalance[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches XLM + custom asset balances from Horizon for a given wallet address.
 * Refreshes automatically every 60 seconds while the component is mounted.
 */
export function useWalletBalance(address: string | null): UseWalletBalanceResult {
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serverRef = useRef(new Horizon.Server(HORIZON_URL));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!address) {
      setBalances([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const account = await serverRef.current.loadAccount(address);

      const all: WalletBalance[] = account.balances.map((b) => {
        if (b.asset_type === "native") {
          return { asset: "XLM", balance: b.balance };
        }
        return {
          asset:
            b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12"
              ? b.asset_code ?? b.asset_type
              : b.asset_type,
          balance: b.balance,
        };
      });

      all.sort((a, b) => {
        if (a.asset === "XLM") return -1;
        if (b.asset === "XLM") return 1;
        return parseFloat(b.balance) - parseFloat(a.balance);
      });

      setBalances(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch balances");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void fetch();

    if (address) {
      intervalRef.current = setInterval(() => void fetch(), REFRESH_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [address, fetch]);

  return { balances, isLoading, error, refresh: fetch };
}
