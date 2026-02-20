"use client";

import { WalletProvider } from "@/context/WalletContext";
import { SocketProvider } from "@/context/SocketContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <SocketProvider>{children}</SocketProvider>
    </WalletProvider>
  );
}
