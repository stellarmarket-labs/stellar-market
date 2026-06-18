import {
  buildMerkleTree,
  getMerkleProof,
  verifyMerkleProof,
  hashLeaf,
  hashPair,
  toHex,
  fromHex,
} from "../merkle";
import { createHash } from "crypto";

function randomHash(): Buffer {
  return createHash("sha256").update(Math.random().toString()).digest();
}

describe("Merkle tree", () => {
  it("produces a deterministic root for the same inputs in the same order", () => {
    const hashes = [randomHash(), randomHash(), randomHash()];
    const tree1 = buildMerkleTree(hashes);
    const tree2 = buildMerkleTree(hashes);
    expect(tree1.root.equals(tree2.root)).toBe(true);
  });

  it("handles a single file (1 leaf)", () => {
    const leaf = randomHash();
    const tree = buildMerkleTree([leaf]);
    const proof = getMerkleProof(tree, 0);
    expect(verifyMerkleProof(leaf, proof)).toBe(true);
  });

  it("handles two files (2 leaves)", () => {
    const leaves = [randomHash(), randomHash()];
    const tree = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = getMerkleProof(tree, i);
      expect(verifyMerkleProof(leaves[i], proof)).toBe(true);
    }
  });

  it("handles three files (padded to power of 2)", () => {
    const leaves = [randomHash(), randomHash(), randomHash()];
    const tree = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = getMerkleProof(tree, i);
      expect(verifyMerkleProof(leaves[i], proof)).toBe(true);
    }
  });

  it("handles eight files (exact power of 2)", () => {
    const leaves = Array.from({ length: 8 }, () => randomHash());
    const tree = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = getMerkleProof(tree, i);
      expect(verifyMerkleProof(leaves[i], proof)).toBe(true);
    }
  });

  it("handles five files (padded to 8)", () => {
    const leaves = Array.from({ length: 5 }, () => randomHash());
    const tree = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = getMerkleProof(tree, i);
      expect(verifyMerkleProof(leaves[i], proof)).toBe(true);
    }
  });

  it("rejects tampered file hash", () => {
    const leaves = [randomHash(), randomHash(), randomHash()];
    const tree = buildMerkleTree(leaves);
    const proof = getMerkleProof(tree, 0);
    const tampered = randomHash();
    expect(verifyMerkleProof(tampered, proof)).toBe(false);
  });

  it("rejects proof with wrong leaf index", () => {
    const leaves = [randomHash(), randomHash()];
    const tree = buildMerkleTree(leaves);
    const proof = getMerkleProof(tree, 0);
    const wrongProof = { ...proof, leafIndex: 1 };
    expect(verifyMerkleProof(leaves[0], wrongProof)).toBe(false);
  });

  it("throws on out-of-range leaf index", () => {
    const leaves = [randomHash()];
    const tree = buildMerkleTree(leaves);
    expect(() => getMerkleProof(tree, -1)).toThrow();
    expect(() => getMerkleProof(tree, 5)).toThrow();
  });

  it("toHex and fromHex round-trip correctly", () => {
    const buf = randomHash();
    expect(fromHex(toHex(buf)).equals(buf)).toBe(true);
  });

  it("hashLeaf produces sha256 of input data", () => {
    const data = Buffer.from("test content");
    const expected = createHash("sha256").update(data).digest();
    expect(hashLeaf(data).equals(expected)).toBe(true);
  });

  it("hashPair produces sha256 of concatenated inputs", () => {
    const left = randomHash();
    const right = randomHash();
    const expected = createHash("sha256")
      .update(Buffer.concat([left, right]))
      .digest();
    expect(hashPair(left, right).equals(expected)).toBe(true);
  });
});
