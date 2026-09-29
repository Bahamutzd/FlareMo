import type { MemoDto } from "@flaremo/contracts";
import { expect, test } from "@playwright/test";
import { THREE_PANE_VIEWPORT } from "./viewports";

test.use({ viewport: THREE_PANE_VIEWPORT });

function note(id: string, content: string): MemoDto {
  return {
    id,
    name: `memos/${id}`,
    creator: "users/local-owner",
    content,
    visibility: "private",
    state: "normal",
    pinned: false,
    payload: {},
    create_time: "2026-09-01T00:00:00Z",
    update_time: "2026-09-01T00:00:00Z",
    display_time: "2026-09-01T00:00:00Z",
    attachments: [],
    can_manage: true,
  };
}

const NOTES = [
  note("pane-a", "Pane note alpha\n\nAlpha body paragraph"),
  note("pane-b", "Pane note bravo\n\nBravo body paragraph"),
  note("pane-c", "Pane note charlie\n\nCharlie body paragraph"),
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/app/memos?*", (route) =>
    route.fulfill({ json: { memos: NOTES } }),
  );
});

test("lists memos in the middle column and reads the selected one on the right", async ({
  page,
}) => {
  await page.goto("/");
  await page.screenshot({ path: "test-results/three-pane-desktop.png" });
  const list = page.getByRole("navigation", { name: /memo list|记录列表/i });
  const pane = page.getByRole("region", { name: /memo content|记录正文/i });

  await expect(list.getByRole("button")).toHaveCount(3);
  // With nothing selected the first row opens on its own.
  await expect(pane.getByText("Alpha body paragraph")).toBeVisible();
  await expect(page).toHaveURL(/memo=pane-a/);

  await list.getByRole("button", { name: /Pane note bravo/ }).click();
  await expect(pane.getByText("Bravo body paragraph")).toBeVisible();
  await expect(
    list.getByRole("button", { name: /Pane note bravo/ }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(/memo=pane-b/);

  await page.reload();
  await expect(pane.getByText("Bravo body paragraph")).toBeVisible();
});

test("the reading pane is the editor and saves changes on its own", async ({
  page,
}) => {
  const saved: string[] = [];
  await page.route("**/api/app/memos/pane-a", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as { content: string };
    saved.push(body.content);
    await route.fulfill({ json: { ...NOTES[0], content: body.content } });
  });
  await page.goto("/?memo=pane-a");
  const pane = page.getByRole("region", { name: /memo content|记录正文/i });
  const editor = pane.getByRole("textbox", { name: /memo content|记录正文/i });
  await expect(editor).toContainText("Alpha body paragraph");

  // No edit mode to enter: a click places the caret and typing edits.
  await editor.getByText("Alpha body paragraph").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await expect(pane.getByTestId("memo-autosave-status")).toHaveText(
    /saved|已保存/i,
  );
  expect(saved.at(-1)).toContain("Alpha body paragraph edited");
});

test("moves the reading pane with the j/k shortcuts", async ({ page }) => {
  await page.goto("/?memo=pane-a");
  const pane = page.getByRole("region", { name: /memo content|记录正文/i });
  await expect(pane.getByText("Alpha body paragraph")).toBeVisible();

  await page.locator("body").press("j");
  await page.locator("body").press("j");
  await expect(pane.getByText("Bravo body paragraph")).toBeVisible();
  await expect(page).toHaveURL(/memo=pane-b/);

  await page.locator("body").press("k");
  await expect(pane.getByText("Alpha body paragraph")).toBeVisible();
});

test("keeps the card timeline below the desktop breakpoint", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("article")).toHaveCount(3);
  const pane = page.getByRole("region", { name: /memo content|记录正文/i });
  await expect(pane).toHaveCount(0);

  // Tapping a card opens it full screen, already editable; Back returns
  // to the timeline.
  await page
    .locator("article")
    .filter({ hasText: "Pane note bravo" })
    .getByText("Bravo body paragraph")
    .click();
  await expect(pane).toBeVisible();
  await expect(page).toHaveURL(/memo=pane-b/);
  await expect(
    pane.getByRole("textbox", { name: /memo content|记录正文/i }),
  ).toContainText("Bravo body paragraph");

  await pane.getByRole("button", { name: /^(back|返回)$/i }).click();
  await expect(pane).toHaveCount(0);
  await expect(page).not.toHaveURL(/memo=/);
  await expect(page.locator("article")).toHaveCount(3);
});

test("formats from the pane toolbar and saves the markdown", async ({
  page,
}) => {
  const saved: string[] = [];
  await page.route("**/api/app/memos/pane-a", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as { content: string };
    saved.push(body.content);
    await route.fulfill({ json: { ...NOTES[0], content: body.content } });
  });
  await page.goto("/?memo=pane-a");
  const pane = page.getByRole("region", { name: /memo content|记录正文/i });
  const editor = pane.getByRole("textbox", { name: /memo content|记录正文/i });
  await expect(editor).toContainText("Alpha body paragraph");

  await editor.getByText("Alpha body paragraph").dblclick();
  const toolbar = pane.getByRole("toolbar");
  await toolbar.getByRole("button", { name: /^(bold|加粗)$/i }).click();
  await expect(
    toolbar.getByRole("button", { name: /^(bold|加粗)$/i }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(pane.getByTestId("memo-autosave-status")).toHaveText(
    /saved|已保存/i,
  );
  expect(saved.at(-1)).toMatch(/\*\*\w+\*\*/);
});

test("new opens an empty editor on the right and the first text creates the memo", async ({
  page,
}) => {
  const created: string[] = [];
  const updated: string[] = [];
  await page.route("**/api/app/memos", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as { content: string };
    created.push(body.content);
    await route.fulfill({
      status: 201,
      json: note("pane-new", body.content),
    });
  });
  await page.route("**/api/app/memos/pane-new", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as { content: string };
    updated.push(body.content);
    await route.fulfill({ json: note("pane-new", body.content) });
  });
  await page.goto("/?memo=pane-a");
  const pane = page.getByRole("region", { name: /memo content|记录正文/i });
  await expect(pane.getByText("Alpha body paragraph")).toBeVisible();
  // The list column carries no composer in this layout.
  await expect(page.locator("#flaremo-composer-input")).toHaveCount(0);

  await page.getByTestId("new-memo-button").click();
  const editor = pane.getByRole("textbox", { name: /memo content|记录正文/i });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText("");

  await page.keyboard.type("Fresh memo");
  await expect(page).toHaveURL(/memo=pane-new/);
  expect(created).toEqual(["Fresh memo"]);

  // Typing on keeps writing into the created memo, never a second one.
  await page.keyboard.type(" continued");
  await expect.poll(() => updated.at(-1)).toBe("Fresh memo continued");
  expect(created).toHaveLength(1);
});
