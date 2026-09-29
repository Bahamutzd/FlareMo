// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { buildComposerExtensions } from "@/components/rich-composer-editor";
import { restoreMarkdownEntities } from "./markdown-entities";

describe("restoreMarkdownEntities", () => {
  it("restores characters that re-parse as the same text", () => {
    expect(restoreMarkdownEntities("f(x)=2+∫(1-&gt;x) dt")).toBe(
      "f(x)=2+∫(1->x) dt",
    );
    expect(restoreMarkdownEntities("a &lt; b &amp;&amp; c &gt; d")).toBe(
      "a < b && c > d",
    );
  });

  it("keeps the encoding where the plain character would change meaning", () => {
    expect(restoreMarkdownEntities("&lt;u&gt;x&lt;/u&gt;")).toBe(
      "&lt;u>x&lt;/u>",
    );
    expect(restoreMarkdownEntities("&gt; not a quote")).toBe(
      "&gt; not a quote",
    );
    expect(restoreMarkdownEntities("x &amp;amp; y &amp;#39;")).toBe(
      "x &amp;amp; y &amp;#39;",
    );
  });

  it("leaves code untouched", () => {
    const fenced = "```\na &gt; b\n```\n\nc &gt; d";
    expect(restoreMarkdownEntities(fenced)).toBe("```\na &gt; b\n```\n\nc > d");
    expect(restoreMarkdownEntities("`a &gt; b` and a &gt; b")).toBe(
      "`a &gt; b` and a > b",
    );
  });

  describe("through the editor", () => {
    const editor = new Editor({
      extensions: buildComposerExtensions(""),
      content: "",
      contentType: "markdown",
    });
    const save = (markdown: string) => {
      editor.commands.setContent(markdown, { contentType: "markdown" });
      return restoreMarkdownEntities(editor.getMarkdown());
    };

    it.each([
      "设y=f(x)是可微的，且满足f(x)=2+∫(1->x)(f(t)^2)/t dt\n\n#wps便签迁移",
      "a < b && c > d",
      "正文 <u>下划线</u> 不放行",
      "x &amp; y 与 &#39;",
      "> 真正的引用\n\n普通 > 段落",
      "`a > b` 与 a > b",
      "```cpp\n#include <vector>\nif (a > b && c < d) {}\n```",
    ])("keeps what the user wrote across saves: %s", (markdown) => {
      const once = save(markdown);
      expect(save(once)).toBe(once);
      expect(once).not.toMatch(/(?<![\w&])-&gt;/);
    });

    it("stores arrows and comparisons as typed", () => {
      expect(save("1->x, a < b && c > d")).toBe("1->x, a < b && c > d");
      expect(save("c<d 与 x<y>z 以外")).toBe("c<d 与 x&lt;y>z 以外");
    });

    it("never turns literal text into raw HTML", () => {
      for (const markdown of [
        "<https://flaremo.app>",
        "<me@example.com>",
        "文字 <!-- 注释 --> 文字",
        "文字 </div> 文字",
        '<span class="x">带属性</span>',
      ]) {
        const once = save(markdown);
        expect(save(once)).toBe(once);
        expect(once).not.toMatch(/<(?:!--|\/?[A-Za-z][\w-]*[\s/>])/);
      }
    });
  });
});
