import { createHash } from "crypto";

const ZERO_HASH = createHash("sha256").update(Buffer.alloc(0)).digest();

export interface MerkleTree {
  root: Buffer;
  layers: Buffer[][];
}

export interface MerkleProof {
  root: Buffer;
  proof: Buffer[];
  leafIndex: number;
}

function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

export function hashLeaf(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function hashPair(left: Buffer, right: Buffer): Buffer {
  return createHash("sha256").update(Buffer.concat([left, right])).digest();
}

export function buildMerkleTree(fileHashes: Buffer[]): MerkleTree {
  if (fileHashes.length === 0) {
    const root = hashPair(ZERO_HASH, ZERO_HASH);
    return { root, layers: [[ZERO_HASH, ZERO_HASH], [root]] };
  }

  const paddedCount = nextPowerOf2(fileHashes.length);
  const leaves: Buffer[] = [...fileHashes];
  while (leaves.length < paddedCount) {
    leaves.push(ZERO_HASH);
  }

  const layers: Buffer[][] = [leaves];
  let current = leaves;

  while (current.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : ZERO_HASH;
      next.push(hashPair(left, right));
    }
    layers.push(next);
    current = next;
  }

  return { root: current[0], layers };
}

export function getMerkleProof(
  tree: MerkleTree,
  leafIndex: number,
): MerkleProof {
  const leaves = tree.layers[0];
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(
      `Leaf index ${leafIndex} out of range (0-${leaves.length - 1})`,
    );
  }

  const proof: Buffer[] = [];
  let idx = leafIndex;

  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level];
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (siblingIdx < layer.length) {
      proof.push(layer[siblingIdx]);
    } else {
      proof.push(ZERO_HASH);
    }
    idx = Math.floor(idx / 2);
  }

  return { root: tree.root, proof, leafIndex };
}

export function verifyMerkleProof(
  fileHash: Buffer,
  proof: MerkleProof,
): boolean {
  let current = fileHash;
  let idx = proof.leafIndex;

  for (const sibling of proof.proof) {
    if (idx % 2 === 0) {
      current = hashPair(current, sibling);
    } else {
      current = hashPair(sibling, current);
    }
    idx = Math.floor(idx / 2);
  }

  return current.equals(proof.root);
}

export function toHex(buf: Buffer): string {
  return buf.toString("hex");
}

export function fromHex(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}
