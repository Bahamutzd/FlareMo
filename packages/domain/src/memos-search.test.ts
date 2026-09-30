import { applyFlaremoMigrations, createDb } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemo, listMemosForViewer } from "./memos";
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
    d1Databases: { DB: "flaremo-search-test" },
  });
  const database = await mf.getD1Database("DB");
  db = createDb(database);
  await applyFlaremoMigrations(database);
  owner = await ensureTeamOwner(db);
});

afterEach(async () => {
  await mf.dispose();
});

async function search(q?: string, tag?: string) {
  const result = await listMemosForViewer(db, owner, {
    page_size: 30,
    order_by: "created_at desc",
    include_deleted: false,
    ...(q ? { q } : {}),
    ...(tag ? { tag } : {}),
  });
  return result.memos.map((memo) => memo.content);
}

describe("listMemosForViewer substring search", () => {
  it("finds a long pasted URL-like query", async () => {
    const content =
      "# https___tenant.apps.ceake1.sjjypt-situat.szdex.com_\n\n账号";
    await createMemo(db, owner, {
      content,
      visibility: "private",
      source: "web",
    });
    await createMemo(db, owner, {
      content: "其他",
      visibility: "private",
      source: "web",
    });

    expect(
      await search("https___tenant.apps.ceake1.sjjypt-situat.szdex.com_"),
    ).toEqual([content]);
  });

  it("matches a long CJK phrase, % and _ literally, and ASCII case-insensitively", async () => {
    const phrase = "请复述以下每一个单词并解释他的涵义以及用法示例";
    await createMemo(db, owner, {
      content: `${phrase}。`,
      visibility: "private",
      source: "web",
    });
    await createMemo(db, owner, {
      content: "进度 100% 完成",
      visibility: "private",
      source: "web",
    });
    await createMemo(db, owner, {
      content: "进度 1000 完成",
      visibility: "private",
      source: "web",
    });
    await createMemo(db, owner, {
      content: "Hello 世界",
      visibility: "private",
      source: "web",
    });

    expect(await search(phrase)).toEqual([`${phrase}。`]);
    expect(await search("100% 完成")).toEqual(["进度 100% 完成"]);
    expect(await search("hello 世界")).toEqual(["Hello 世界"]);
  });

  it("filters a long CJK tag path with its descendants", async () => {
    const tag = "知识库/工作笔记/项目资料汇总/第二阶段";
    await createMemo(db, owner, {
      content: `#${tag} 本身`,
      visibility: "private",
      source: "web",
    });
    await createMemo(db, owner, {
      content: `#${tag}/细节 子标签`,
      visibility: "private",
      source: "web",
    });
    await createMemo(db, owner, {
      content: `#${tag}补充 相似前缀`,
      visibility: "private",
      source: "web",
    });

    expect((await search(undefined, tag)).sort()).toEqual(
      [`#${tag} 本身`, `#${tag}/细节 子标签`].sort(),
    );
  });
});
