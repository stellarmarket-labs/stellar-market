"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, Loader2, ExternalLink } from "lucide-react";

interface EvidenceItem {
  id: string;
  fileUrl: string;
  fileHash: string;
  leafIndex: number;
  merkleProof: string[];
  fileName: string;
  fileType: string;
}

interface EvidenceVerifierProps {
  disputeId: string;
  evidence: EvidenceItem[];
  onChainRoot?: string;
  apiBaseUrl?: string;
}

type VerificationState = "idle" | "verifying" | "verified" | "mismatch" | "error";

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyMerkleProofClientSide(
  fileHashHex: string,
  proofHexStrings: string[],
  leafIndex: number,
  rootHex: string,
): Promise<boolean> {
  let currentHash = fileHashHex;
  let idx = leafIndex;

  for (const siblingHex of proofHexStrings) {
    const left = idx % 2 === 0 ? currentHash : siblingHex;
    const right = idx % 2 === 0 ? siblingHex : currentHash;
    const combined = new Uint8Array(
      [...hexToBytes(left), ...hexToBytes(right)],
    );
    const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    currentHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    idx = Math.floor(idx / 2);
  }

  return currentHash === rootHex;
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

export default function EvidenceVerifier({
  disputeId,
  evidence,
  onChainRoot,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api",
}: EvidenceVerifierProps) {
  const [verificationStates, setVerificationStates] = useState<
    Map<string, VerificationState>
  >(new Map());

  const handleVerify = async (item: EvidenceItem) => {
    setVerificationStates((prev) => {
      const next = new Map(prev);
      next.set(item.id, "verifying");
      return next;
    });

    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const proofRes = await fetch(
        `${apiBaseUrl}/disputes/${disputeId}/evidence/${item.id}/proof`,
        { headers },
      );

      if (!proofRes.ok) {
        setVerificationStates((prev) => {
          const next = new Map(prev);
          next.set(item.id, "error");
          return next;
        });
        return;
      }

      const proofData = await proofRes.json();

      let rootToVerify: string;
      if (onChainRoot) {
        rootToVerify = onChainRoot;
      } else if (proofData.onChainRoot) {
        rootToVerify = proofData.onChainRoot;
      } else {
        setVerificationStates((prev) => {
          const next = new Map(prev);
          next.set(item.id, "error");
          return next;
        });
        return;
      }

      const response = await fetch(item.fileUrl);
      if (!response.ok) {
        setVerificationStates((prev) => {
          const next = new Map(prev);
          next.set(item.id, "error");
          return next;
        });
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const computedHash = await sha256Hex(arrayBuffer);

      const isProofValid = await verifyMerkleProofClientSide(
        computedHash,
        proofData.proof,
        proofData.leafIndex,
        rootToVerify,
      );

      setVerificationStates((prev) => {
        const next = new Map(prev);
        next.set(item.id, isProofValid ? "verified" : "mismatch");
        return next;
      });
    } catch {
      setVerificationStates((prev) => {
        const next = new Map(prev);
        next.set(item.id, "error");
        return next;
      });
    }
  };

  if (evidence.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-medium text-theme-text-muted uppercase tracking-wider mb-2">
        Submitted Evidence
      </p>
      <ul className="space-y-2">
        {evidence.map((item) => {
          const state = verificationStates.get(item.id) || "idle";

          return (
            <li
              key={item.id}
              className="flex items-center justify-between bg-theme-card border border-theme-border rounded-lg px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-theme-heading truncate max-w-[200px]">
                  {item.fileName}
                </p>
                <p className="text-[10px] text-theme-text-muted">{item.fileType}</p>
                {state === "verified" && (
                  <p className="text-[10px] text-green-600 font-medium mt-0.5">
                    Verified - matches on-chain commitment
                  </p>
                )}
                {state === "mismatch" && (
                  <p className="text-[10px] text-red-600 font-medium mt-0.5">
                    Warning - file does not match original
                  </p>
                )}
                {state === "error" && (
                  <p className="text-[10px] text-theme-error font-medium mt-0.5">
                    Verification failed - could not complete check
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <a
                  href={item.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-stellar-blue hover:underline"
                >
                  View <ExternalLink size={11} />
                </a>
                {state === "idle" && (
                  <button
                    type="button"
                    onClick={() => handleVerify(item)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-theme-border hover:border-stellar-blue hover:text-stellar-blue transition-colors"
                  >
                    <ShieldCheck size={12} />
                    Verify
                  </button>
                )}
                {state === "verifying" && (
                  <span className="flex items-center gap-1 text-xs text-theme-text-muted">
                    <Loader2 size={12} className="animate-spin" />
                    Checking...
                  </span>
                )}
                {state === "verified" && (
                  <ShieldCheck size={16} className="text-green-600" />
                )}
                {state === "mismatch" && (
                  <ShieldAlert size={16} className="text-red-600" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
