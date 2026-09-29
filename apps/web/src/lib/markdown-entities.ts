/**
 * TipTap's Markdown serializer encodes `&`, `<` and `>` in every prose text
 * node, so a memo saved from the editor stores `1->x` as `1-&gt;x`. Renderers
 * decode it again, but the stored text drifts from what the user wrote: search
 * for `->` misses, list previews and API clients see entities.
 *
 * This undoes the encoding wherever the plain character re-parses as the same
 * text, and keeps it where it is load-bearing:
 * - `&lt;` that would open an HTML tag, comment or autolink;
 * - `&gt;` first on a line would start a blockquote;
 * - `&amp;` before `name;` or `#123;` would read back as an entity.
 * Code (fenced blocks and backtick spans) is never encoded by the serializer,
 * so any entity text there is literal and left alone.
 */
export function restoreMarkdownEntities(markdown: string) {
  if (!markdown.includes("&")) return markdown;
  const lines = markdown.split("\n");
  let fence: string | null = null;
  return lines
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence) {
        if (marker && marker[0] === fence[0] && marker.length >= fence.length)
          fence = null;
        return line;
      }
      if (marker) {
        fence = marker;
        return line;
      }
      return restoreProseLine(line);
    })
    .join("\n");
}

/**
 * What may follow a literal `<` for CommonMark to read raw HTML or an
 * autolink: an open/close tag, a comment, a declaration or processing
 * instruction, a URI or an email address in angle brackets.
 */
const HTML_AFTER_LT =
  /^(?:[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|\/[A-Za-z][A-Za-z0-9-]*\s*>|!--|![A-Za-z]|\?|[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>|[^\s<>@]+@[^\s<>]+>)/;

/** Backtick code spans; escaped backticks (`\``) do not open one. */
const CODE_SPAN = /(?<!\\)(`+)(?:(?!\1)[\s\S])*?\1/g;

function restoreProseLine(line: string) {
  let out = "";
  let last = 0;
  for (const match of line.matchAll(CODE_SPAN)) {
    out += restoreProse(line.slice(last, match.index), last === 0);
    out += match[0];
    last = match.index + match[0].length;
  }
  return out + restoreProse(line.slice(last), last === 0);
}

function restoreProse(text: string, atLineStart: boolean) {
  return text.replace(
    /&(lt|gt|amp);/g,
    (entity, name: string, offset: number, whole: string) => {
      const after = whole.slice(offset + entity.length);
      if (name === "lt") {
        // Judge the tag against the decoded text: `&gt;` closing it is
        // itself restored to `>` further along.
        return HTML_AFTER_LT.test(after.replace(/&gt;/g, ">")) ? entity : "<";
      }
      if (name === "gt") {
        const leadingOnly = atLineStart && /^\s*$/.test(whole.slice(0, offset));
        return leadingOnly ? entity : ">";
      }
      return /^(?:[A-Za-z][A-Za-z0-9]*|#\d+|#x[0-9A-Fa-f]+);/.test(after)
        ? entity
        : "&";
    },
  );
}
