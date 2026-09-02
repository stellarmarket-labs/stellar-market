"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

type Status = "loading" | "success" | "error";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No unsubscribe token was provided.");
      return;
    }

    let cancelled = false;

    async function unsubscribe() {
      try {
        const res = await fetch(`${API}/unsubscribe?token=${encodeURIComponent(token)}`, {
          headers: { Accept: "application/json" },
        });
        const data = await res.json();
        if (cancelled) return;

        if (res.ok) {
          setStatus("success");
          setMessage(data.message ?? "You have been unsubscribed from marketing emails.");
        } else {
          setStatus("error");
          setMessage(data.error ?? "Something went wrong.");
        }
      } catch {
        if (cancelled) return;
        setStatus("error");
        setMessage("Unable to reach the server. Please try again later.");
      }
    }

    unsubscribe();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
      <div className="card max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-stellar-blue" />
            <h1 className="mt-4 text-xl font-semibold text-[var(--text-heading)]">
              Processing your request…
            </h1>
            <p className="mt-2 text-[var(--text-muted)]">
              Please wait while we update your preferences.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--success)]" />
            <h1 className="mt-4 text-xl font-semibold text-[var(--text-heading)]">
              Unsubscribed
            </h1>
            <p className="mt-2 text-[var(--text-muted)]">{message}</p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-[var(--accent-blue)] hover:underline"
            >
              Return to StellarMarket
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-[var(--error)]" />
            <h1 className="mt-4 text-xl font-semibold text-[var(--text-heading)]">
              Something went wrong
            </h1>
            <p className="mt-2 text-[var(--text-muted)]">{message}</p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-[var(--accent-blue)] hover:underline"
            >
              Return to StellarMarket
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
          <div className="card max-w-md w-full text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-stellar-blue" />
            <h1 className="mt-4 text-xl font-semibold text-[var(--text-heading)]">
              Loading…
            </h1>
          </div>
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
