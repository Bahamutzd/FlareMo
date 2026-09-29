import { describe, expect, it } from "vitest";
import {
  formatMemoRelativeTime,
  formatMemoTime,
  memoListPreview,
} from "./memo";

// A fixed locale keeps the assertions about the formatter's decision (is the
// year spelled out), not about the runner's default locale.
const LOCALE = "en-US";

function at(year: number, month = 8, day = 20, hour = 20, minute = 43) {
  return new Date(Date.UTC(year, month, day, hour, minute)).toISOString();
}

describe("formatMemoTime", () => {
  it("omits the year for memos from the current year", () => {
    const thisYear = new Date().getFullYear();
    const formatted = formatMemoTime(at(thisYear), LOCALE);
    expect(formatted).not.toContain(String(thisYear));
  });

  it("includes the year for memos from another year (issue #143)", () => {
    const thisYear = new Date().getFullYear();
    const otherYear = thisYear - 1;
    const formatted = formatMemoTime(at(otherYear), LOCALE);
    expect(formatted).toContain(String(otherYear));
  });

  it("includes the year for future-dated memos instead of dropping it", () => {
    const future = new Date().getFullYear() + 1;
    expect(formatMemoTime(at(future), LOCALE)).toContain(String(future));
  });

  it("returns an empty string for unparsable values", () => {
    expect(formatMemoTime("not-a-date", LOCALE)).toBe("");
  });
});

describe("formatMemoRelativeTime", () => {
  it("falls back to the absolute format past a week, keeping the year rule", () => {
    const old = new Date(Date.now() - 30 * 86_400_000);
    const thisYear = new Date().getFullYear();
    const formatted = formatMemoRelativeTime(old.toISOString(), LOCALE);
    if (old.getFullYear() === thisYear) {
      expect(formatted).not.toContain(String(thisYear));
    } else {
      expect(formatted).toContain(String(old.getFullYear()));
    }
  });
});

describe("memoListPreview", () => {
  it("titles by the first line and flattens the rest into the excerpt", () => {
    expect(
      memoListPreview("# 标题\n\n- 第一项\n- **第二项**\n\n#收藏 #wps"),
    ).toEqual({ title: "标题", excerpt: "第一项 第二项" });
  });

  it("keeps code lines but drops fence markers", () => {
    const preview = memoListPreview(
      '```cpp\n#include"common.hpp"\nint main() {}\n```\n\n#wps',
    );
    expect(preview.title).toBe('#include"common.hpp"');
    expect(preview.excerpt).toBe("int main() {}");
  });

  it("returns the first inline image and leaves image-only titles empty", () => {
    const content =
      "![a.jpg](/file/attachments/a/a.jpg)\n\n![b.png](/file/attachments/b/b.png)\n\n#tag";
    expect(memoListPreview(content)).toEqual({
      title: "",
      excerpt: "",
      imageSrc: "/file/attachments/a/a.jpg",
    });
    // Same answer on a repeated call (no stateful global regex).
    expect(memoListPreview(content).imageSrc).toBe("/file/attachments/a/a.jpg");
  });

  it("reads image sources with a title or in angle brackets", () => {
    expect(
      memoListPreview('Note ![x](/file/attachments/y/y.png "cap")').imageSrc,
    ).toBe("/file/attachments/y/y.png");
    expect(
      memoListPreview("Note ![x](</file/attachments/z/a b.png>)").imageSrc,
    ).toBe("/file/attachments/z/a b.png");
  });
});
