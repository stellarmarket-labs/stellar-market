"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import ChatWindow, { ChatMessage } from "@/components/chat/ChatWindow";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
const TOKEN_KEY = "stellarmarket_jwt";
const USER_ID_KEY = "stellarmarket_userId";

export default function ConversationPage() {
  const params = useParams();
  const partnerId = params?.conversationId as string;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerUsername, setPartnerUsername] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const userId = localStorage.getItem(USER_ID_KEY) ?? "";
    setCurrentUserId(userId);

    if (!token || !partnerId) {
      setError("Missing auth or conversation ID.");
      setLoading(false);
      return;
    }

    axios
      .get<ChatMessage[]>(`${API}/messages/${partnerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setMessages(res.data);
        // Derive partner username from first message
        const first = res.data[0];
        if (first) {
          const partner =
            first.sender.id === userId ? first.sender : first.sender;
          setPartnerUsername(partner.username);
        }
      })
      .catch(() => setError("Failed to load conversation."))
      .finally(() => setLoading(false));
  }, [partnerId]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="h-96 bg-dark-card rounded-xl animate-pulse border border-dark-border" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col h-[calc(100vh-4rem)]">
      <Link
        href="/messages"
        className="flex items-center gap-2 text-dark-muted hover:text-dark-heading text-sm mb-4 transition-colors w-fit"
      >
        <ArrowLeft size={16} />
        Back to messages
      </Link>

      <div className="flex-1 bg-dark-card border border-dark-border rounded-xl overflow-hidden flex flex-col">
        <ChatWindow
          currentUserId={currentUserId}
          partnerId={partnerId}
          partnerUsername={partnerUsername || partnerId}
          initialMessages={messages}
        />
      </div>
    </main>
  );
}
