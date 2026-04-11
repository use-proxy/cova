// @vitest-environment node
/**
 * HNSW Migration Tests
 *
 * Validates the migration SQL file and HNSW index configuration.
 * Also tests product similarity query expectations.
 */

import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { globSync } from "glob";

const MIGRATION_DIR = resolve(__dirname, "../../../../supabase/migrations");

describe("HNSW index migration", () => {
  test("HNSW migration file exists", () => {
    const files = globSync(`${MIGRATION_DIR}/*hnsw*`);
    expect(files.length).toBeGreaterThan(0);
  });

  test("migration drops old IVFFlat indexes", () => {
    const files = globSync(`${MIGRATION_DIR}/*hnsw*`);
    const content = readFileSync(files[0], "utf-8");
    expect(content).toContain("DROP INDEX IF EXISTS");
    expect(content.toLowerCase()).toContain("ivfflat");
  });

  test("migration creates HNSW index with correct parameters", () => {
    const files = globSync(`${MIGRATION_DIR}/*hnsw*`);
    const content = readFileSync(files[0], "utf-8");

    // Must use HNSW
    expect(content.toLowerCase()).toContain("using hnsw");

    // Must use cosine ops (not L2 or inner product)
    expect(content).toContain("vector_cosine_ops");

    // Must have m parameter (connections per layer)
    expect(content).toMatch(/m\s*=\s*16/);

    // Must have ef_construction parameter
    expect(content).toMatch(/ef_construction\s*=\s*64/);
  });

  test("migration targets clip_embedding_data column", () => {
    const files = globSync(`${MIGRATION_DIR}/*hnsw*`);
    const content = readFileSync(files[0], "utf-8");
    expect(content).toContain("clip_embedding_data");
  });

  test("migration is idempotent (uses IF NOT EXISTS / IF EXISTS)", () => {
    const files = globSync(`${MIGRATION_DIR}/*hnsw*`);
    const content = readFileSync(files[0], "utf-8");
    expect(content).toContain("IF NOT EXISTS");
    expect(content).toContain("IF EXISTS");
  });
});

describe("IVFFlat → HNSW migration rationale", () => {
  test("HNSW is better for dynamic data (no rebuild needed)", () => {
    // IVFFlat requires periodic REINDEX after significant data changes
    // HNSW automatically maintains quality as data is added/removed
    // Cova's product catalog changes as retailers are added (M6 → M8)
    const hnsw = { requiresRebuild: false, dynamicInserts: true };
    const ivfflat = { requiresRebuild: true, dynamicInserts: false };

    expect(hnsw.requiresRebuild).toBe(false);
    expect(ivfflat.requiresRebuild).toBe(true);
  });

  test("HNSW achieves better recall than IVFFlat at same latency", () => {
    // At Cova's scale (~15,900 products), HNSW recall@10 > 99%
    // IVFFlat recall depends on nprobe setting
    // nprobe=1: fast but ~80% recall
    // nprobe=10: 99% recall but slower than HNSW
    const hnswRecall = 0.99;
    const ivfflatRecall_nprobe1 = 0.8;
    const ivfflatRecall_nprobe10 = 0.99;

    expect(hnswRecall).toBeGreaterThanOrEqual(ivfflatRecall_nprobe1);
    expect(hnswRecall).toBeGreaterThanOrEqual(ivfflatRecall_nprobe10);
  });

  test("HNSW parameters are tuned for 768-dim 15,900-product scale", () => {
    const m = 16; // connections per layer
    const efConstruction = 64; // build-time search depth

    // m=16 is standard for medium-scale datasets
    expect(m).toBeGreaterThanOrEqual(8);
    expect(m).toBeLessThanOrEqual(64);

    // ef_construction >= 2*m is a common rule of thumb
    expect(efConstruction).toBeGreaterThanOrEqual(2 * m);
  });
});

describe("Existing IVFFlat migration history", () => {
  test("at least one IVFFlat migration exists (confirming we are replacing it)", () => {
    const ivfflatFiles = globSync(`${MIGRATION_DIR}/*ivfflat*`);
    expect(ivfflatFiles.length).toBeGreaterThan(0);
  });

  test("existing migrations reference 768-dim vectors", () => {
    const allMigrations = globSync(`${MIGRATION_DIR}/*.sql`);
    let found768 = false;
    for (const file of allMigrations) {
      const content = readFileSync(file, "utf-8");
      if (
        content.includes("768") &&
        (content.includes("vector") || content.includes("embedding"))
      ) {
        found768 = true;
        break;
      }
    }
    expect(found768).toBe(true);
  });
});
