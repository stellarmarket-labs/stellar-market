/**
 * Proposal diff computation and comparison utilities
 * Handles field-level diffs for milestone negotiations
 * Uses jsdiff library for robust diff computation handling edge cases
 */

import { diffWords } from "jsdiff";

export interface MilestoneSnapshot {
  title: string;
  description: string;
  amount: number;
  dueDate: string; // ISO date string
}

export interface FieldDiff {
  field: "title" | "description" | "amount" | "dueDate";
  changed: boolean;
  prev?: string | number;
  next?: string | number;
  delta?: string | number; // e.g., "+$300" or "+15 days"
  wordDiffs?: WordDiff[]; // For text fields
}

export interface WordDiff {
  type: "added" | "removed" | "unchanged";
  text: string;
}

export interface MilestoneFieldDiffs {
  milestoneId: string;
  title: string;
  fields: FieldDiff[];
  allUnchanged: boolean;
}

export interface ProposalSnapshot {
  milestones: MilestoneSnapshot[];
  proposedAt: number;
  proposedBy: string;
}

/**
 * Word-level diff using jsdiff library
 * Returns an array of WordDiff objects showing added, removed, or unchanged words.
 * Handles edge cases: empty strings, special characters, whitespace variations.
 */
function computeWordDiff(prev: string, next: string): WordDiff[] {
  // Handle empty strings
  if (!prev && !next) {
    return [];
  }

  const diffs: WordDiff[] = [];

  // Use jsdiff for robust word-level comparison
  const changes = diffWords(prev || "", next || "");

  for (const change of changes) {
    if (change.added) {
      diffs.push({ type: "added", text: change.value });
    } else if (change.removed) {
      diffs.push({ type: "removed", text: change.value });
    } else {
      diffs.push({ type: "unchanged", text: change.value });
    }
  }

  return diffs;
}

/**
 * Format date difference (e.g., "+15 days")
 */
function formatDateDelta(prevDate: string, nextDate: string): string {
  try {
    const prev = new Date(prevDate).getTime();
    const next = new Date(nextDate).getTime();
    const daysDiff = Math.round((next - prev) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) return "no change";
    if (daysDiff > 0) return `+${daysDiff}d`;
    return `${daysDiff}d`;
  } catch {
    return "";
  }
}

/**
 * Format amount difference (e.g., "+$300")
 */
function formatAmountDelta(prev: number, next: number): string {
  const delta = next - prev;
  if (delta === 0) return "no change";
  if (delta > 0) return `+${delta.toLocaleString()}`;
  return `${delta.toLocaleString()}`;
}

/**
 * Compute field-level diffs between two milestone snapshots
 */
export function computeMilestoneDiff(
  prev: MilestoneSnapshot,
  next: MilestoneSnapshot
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // Title diff
  const titleChanged = prev.title !== next.title;
  diffs.push({
    field: "title",
    changed: titleChanged,
    prev: prev.title,
    next: next.title,
    wordDiffs: titleChanged ? computeWordDiff(prev.title, next.title) : undefined,
  });

  // Description diff
  const descriptionChanged = prev.description !== next.description;
  diffs.push({
    field: "description",
    changed: descriptionChanged,
    prev: prev.description,
    next: next.description,
    wordDiffs: descriptionChanged ? computeWordDiff(prev.description, next.description) : undefined,
  });

  // Amount diff
  const amountChanged = prev.amount !== next.amount;
  diffs.push({
    field: "amount",
    changed: amountChanged,
    prev: prev.amount,
    next: next.amount,
    delta: amountChanged ? formatAmountDelta(prev.amount, next.amount) : undefined,
  });

  // Due date diff
  const dateChanged = prev.dueDate !== next.dueDate;
  diffs.push({
    field: "dueDate",
    changed: dateChanged,
    prev: prev.dueDate,
    next: next.dueDate,
    delta: dateChanged ? formatDateDelta(prev.dueDate, next.dueDate) : undefined,
  });

  return diffs;
}

/**
 * Compute all milestone diffs between previous and next snapshots
 * Matches milestones by title (trimmed)
 */
export function computeProposalDiffs(
  prevSnapshot: MilestoneSnapshot[],
  nextSnapshot: MilestoneSnapshot[]
): MilestoneFieldDiffs[] {
  const result: MilestoneFieldDiffs[] = [];
  const prevByTitle = new Map(prevSnapshot.map((m) => [m.title.trim(), m]));

  for (const nextMilestone of nextSnapshot) {
    const prevMilestone = prevByTitle.get(nextMilestone.title.trim());

    if (prevMilestone) {
      const fields = computeMilestoneDiff(prevMilestone, nextMilestone);
      const allUnchanged = fields.every((f) => !f.changed);

      result.push({
        milestoneId: nextMilestone.title, // Using title as ID for matching
        title: nextMilestone.title,
        fields,
        allUnchanged,
      });
    } else {
      // New milestone - all fields are "changed"
      result.push({
        milestoneId: nextMilestone.title,
        title: nextMilestone.title,
        fields: [
          {
            field: "title",
            changed: true,
            prev: undefined,
            next: nextMilestone.title,
          },
          {
            field: "description",
            changed: true,
            prev: undefined,
            next: nextMilestone.description,
          },
          {
            field: "amount",
            changed: true,
            prev: undefined,
            next: nextMilestone.amount,
          },
          {
            field: "dueDate",
            changed: true,
            prev: undefined,
            next: nextMilestone.dueDate,
          },
        ],
        allUnchanged: false,
      });
    }
  }

  return result;
}

/**
 * Check if all milestones are unchanged
 */
export function areAllMilestonesUnchanged(diffs: MilestoneFieldDiffs[]): boolean {
  return diffs.length === 0 || diffs.every((m) => m.allUnchanged);
}
