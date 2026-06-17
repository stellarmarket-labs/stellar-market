"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MilestoneFieldDiffs, FieldDiff, WordDiff } from "@/utils/proposalDiff";

interface DiffViewerProps {
  milestoneDiffs: MilestoneFieldDiffs[];
  proposedBy: string;
  receivedAt: Date;
}

/**
 * WordDiffDisplay renders a word-level diff with strikethrough for removed words
 * and highlighting for added words
 */
function WordDiffDisplay({ diffs }: { diffs: WordDiff[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {diffs.map((diff, idx) => {
        if (diff.type === "removed") {
          return (
            <span
              key={idx}
              className="line-through text-red-500 bg-red-50 px-1 rounded"
            >
              {diff.text}
            </span>
          );
        }
        if (diff.type === "added") {
          return (
            <span
              key={idx}
              className="bg-green-100 text-green-700 px-1 rounded font-medium"
            >
              {diff.text}
            </span>
          );
        }
        return (
          <span key={idx} className="text-theme-text">
            {diff.text}
          </span>
        );
      })}
    </div>
  );
}

/**
 * FieldDiffDisplay renders a single field's diff
 */
function FieldDiffDisplay({ field }: { field: FieldDiff }) {
  const { field: fieldName, changed, prev, next, delta, wordDiffs } = field;

  if (!changed) {
    return null; // Collapsed by default
  }

  if (fieldName === "title" || fieldName === "description") {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-theme-text">
          {fieldName === "title" ? "Title" : "Description"}
        </label>
        {wordDiffs ? (
          <div className="p-3 bg-theme-border/30 rounded border border-theme-border">
            <WordDiffDisplay diffs={wordDiffs} />
          </div>
        ) : (
          <div className="p-3 bg-theme-border/30 rounded border border-theme-border text-theme-text text-sm">
            {next || "(empty)"}
          </div>
        )}
      </div>
    );
  }

  if (fieldName === "amount") {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-theme-text">
          Amount
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-red-50 rounded border border-red-200">
            <div className="text-xs text-red-600 font-medium mb-1">Before</div>
            <div className="text-lg font-semibold text-red-700 line-through">
              {prev ? `${Number(prev).toLocaleString()} XLM` : "—"}
            </div>
          </div>
          <div className="p-3 bg-green-50 rounded border border-green-200">
            <div className="text-xs text-green-600 font-medium mb-1">After</div>
            <div className="text-lg font-semibold text-green-700">
              {next ? `${Number(next).toLocaleString()} XLM` : "—"}
            </div>
            {delta && (
              <div className="text-xs text-green-600 mt-1">({delta})</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (fieldName === "dueDate") {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-theme-text">
          Due Date
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-red-50 rounded border border-red-200">
            <div className="text-xs text-red-600 font-medium mb-1">Before</div>
            <div className="text-lg font-semibold text-red-700 line-through">
              {prev ? new Date(String(prev)).toLocaleDateString() : "—"}
            </div>
          </div>
          <div className="p-3 bg-green-50 rounded border border-green-200">
            <div className="text-xs text-green-600 font-medium mb-1">After</div>
            <div className="text-lg font-semibold text-green-700">
              {next ? new Date(String(next)).toLocaleDateString() : "—"}
            </div>
            {delta && (
              <div className="text-xs text-green-600 mt-1">({delta})</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * MilestoneDiffSection renders diffs for a single milestone
 */
function MilestoneDiffSection({ diff }: { diff: MilestoneFieldDiffs }) {
  const [expanded, setExpanded] = useState(true);
  const changedFieldCount = diff.fields.filter((f) => f.changed).length;

  return (
    <div className="space-y-3">
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-theme-border/20 p-2 rounded"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown size={16} className="text-theme-text" />
          ) : (
            <ChevronRight size={16} className="text-theme-text" />
          )}
          <span className="font-medium text-theme-heading">{diff.title}</span>
        </div>
        {changedFieldCount > 0 && (
          <span className="inline-block px-2 py-1 bg-theme-warning/20 text-theme-warning text-xs rounded font-medium">
            {changedFieldCount} changed
          </span>
        )}
        {diff.allUnchanged && (
          <span className="inline-block px-2 py-1 bg-theme-success/20 text-theme-success text-xs rounded font-medium">
            No changes
          </span>
        )}
      </div>

      {expanded && (
        <div className="ml-4 space-y-4 p-3 bg-theme-border/10 rounded">
          {diff.fields.map((field) => (
            <FieldDiffDisplay key={field.field} field={field} />
          ))}
          {diff.allUnchanged && (
            <p className="text-sm text-theme-text italic">
              This milestone has no changes from the previous proposal.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * DiffViewer displays all milestone diffs from a counter-proposal
 */
export default function DiffViewer({
  milestoneDiffs,
  proposedBy,
  receivedAt,
}: DiffViewerProps) {
  const allUnchanged =
    milestoneDiffs.length === 0 ||
    milestoneDiffs.every((m) => m.allUnchanged);

  return (
    <div className="border border-theme-border rounded-lg bg-theme-bg/50 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-theme-heading mb-1">
          Counter-proposal from {proposedBy}
        </h3>
        <p className="text-xs text-theme-text">
          Received {receivedAt.toLocaleString()}
        </p>
      </div>

      <div className="border-t border-theme-border pt-4">
        {allUnchanged ? (
          <p className="text-sm text-theme-text italic text-center py-4">
            No changes proposed. The milestone terms remain the same.
          </p>
        ) : (
          <div className="space-y-3">
            {milestoneDiffs.map((diff) => (
              <MilestoneDiffSection key={diff.milestoneId} diff={diff} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
