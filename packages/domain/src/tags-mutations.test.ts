import { applyFlaremoMigrations, createDb, memos, memoTags } from "@flaremo/db";
import { eq, sql } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemo } from "./memos-write";
import { deleteTag, renameTag } from "./tags";
import type { TeamViewer } from "./team-permissions";
import { ensureTeamOwner } from "./test-support";

let mf: Miniflare;
let db: ReturnType<typeof createDb>;
let owner: TeamViewer;

beforeEach(async () => {
  mf = new Miniflare({
    script: "export default { fetch() { return new Response('ok') } }",
    modules: true,
    compatibilityDate: "2026-07-10",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "flaremo-tag-mutations-test" },
  });
  const database = await mf.getD1Database("DB");
  db = createDb(database);
  await applyFlaremoMigrations(database);
  owner = await ensureTeamOwner(db);
});

afterEach(async () => {
  await mf.dispose();
});

// D1 caps a query at 100 bound parameters. A tag used by more memos than that
// must still load them all: an unchunked `IN (...)` threw `too many SQL
// variables`, so deleting or renaming an imported tag on a real instance
// (hundreds of memos) failed with a 500.
const MEMO_COUNT = 120;

async function seedTaggedMemos() {
  for (let index = 0; index < MEMO_COUNT; index += 1) {
    await createMemo(db, owner, {
      content: `note ${index} #批量`,
      visibility: "private",
      payload: {},
      source: "web",
    });
  }
  const tagged = await db
    .select({ c: sql<number>`count(*)`.mapWith(Number) })
    .from(memoTags)
    .where(eq(memoTags.tag, "批量"));
  // The premise: more tagged memos than one statement can bind.
  expect(tagged[0]?.c).toBe(MEMO_COUNT);
}

describe("tag mutations over more than 100 memos", () => {
  it("deletes the tag from every memo", async () => {
    await seedTaggedMemos();

    await expect(deleteTag(db, owner, { tag: "批量" })).resolves.toEqual({
      removed: MEMO_COUNT,
    });

    const remaining = await db
      .select({ c: sql<number>`count(*)`.mapWith(Number) })
      .from(memoTags)
      .where(eq(memoTags.tag, "批量"));
    expect(remaining[0]?.c).toBe(0);
    const stillMentioning = await db
      .select({ c: sql<number>`count(*)`.mapWith(Number) })
      .from(memos)
      .where(sql`${memos.content} LIKE '%#批量%'`);
    expect(stillMentioning[0]?.c).toBe(0);
  });

  it("renames the tag on every memo", async () => {
    await seedTaggedMemos();

    await expect(
      renameTag(db, owner, { from: "批量", to: "归档/批量" }),
    ).resolves.toEqual({ renamed: MEMO_COUNT });

    const moved = await db
      .select({ c: sql<number>`count(*)`.mapWith(Number) })
      .from(memoTags)
      .where(eq(memoTags.tag, "归档/批量"));
    expect(moved[0]?.c).toBe(MEMO_COUNT);
  });
});
