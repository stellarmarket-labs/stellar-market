"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

type Status = "loading" | "success" | "invalid" | "error";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const startedRef = useRef(false);

  useEffect(() => {
    // Guard against Strict Mode double-invoke re-firing the one-shot API call.
    if (startedRef.current) return;
    startedRef.current = true;

    if (!token) {
      setStatus("invalid");
      return;
    }

    axios
      .get(`${API}/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(() => setStatus("success"))
      .catch((err) => {
        // 400 = the backend rejected the token (expired/invalid)
        setStatus(err?.response?.status === 400 ? "invalid" : "error");
      });
  }, [token]);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {status === "loading" && (
          <>
            <Loader2
              aria-hidden="true"
              className="mx-auto h-10 w-10 animate-spin text-blue-600 dark:text-blue-400"
            />
            <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
              Processing your request…
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Please wait while we update your email preferences.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2
              aria-hidden="true"
              className="mx-auto h-10 w-10 text-green-600 dark:text-green-400"
            />
            <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
              Unsubscribed
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              You have been unsubscribed from marketing emails. You will still
              receive important transactional notifications.
            </p>
          </>
        )}

        {status === "invalid" && (
          <>
            <XCircle
              aria-hidden="true"
              className="mx-auto h-10 w-10 text-red-600 dark:text-red-400"
            />
            <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
              Link invalid or expired
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              This unsubscribe link is invalid or has expired. Unsubscribe links
              expire after 90 days — request a new notification email to get a
              fresh link.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle
              aria-hidden="true"
              className="mx-auto h-10 w-10 text-red-600 dark:text-red-400"
            />
            <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              We couldn&apos;t process your unsubscribe request. Please try
              again later.
            </p>
          </>
        )}

        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Return to StellarMarket
        </Link>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
          <Loader2
            aria-hidden="true"
            className="h-10 w-10 animate-spin text-blue-600 dark:text-blue-400"
          />
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
