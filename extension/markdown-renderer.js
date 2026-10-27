// GENERATED from src/content/markdown-renderer.ts. Edit src/ and run npm run build.
(function(root, factory) {
  "use strict";
  const api = factory(
    typeof module === "object" && module.exports ? require("./marked.umd.js") : root.marked,
    root,
    typeof module === "object" && module.exports ? require("./marked-cjk-friendly.umd.js") : root.markedCjkFriendly,
    typeof module === "object" && module.exports ? require("./math-renderer.js") : root.SuperXMath
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GrokFirstMarkdown = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function(marked, root, cjkFriendly, math) {
    "use strict";
    const LIMITS = Object.freeze({
      text: 3e4,
      depth: 32,
      nodes: 12e3,
      tokens: 12e3
    });
    const ENTITIES = Object.freeze({
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
      ndash: "–",
      mdash: "—",
      hellip: "…",
      copy: "©",
      reg: "®",
      trade: "™",
      laquo: "«",
      raquo: "»",
      middot: "·",
      bull: "•"
    });
    function decodeEntities(value) {
      return String(value ?? "").replace(
        /&(#(?:[xX][\da-fA-F]{1,6}|\d{1,7})|[a-zA-Z]+);/g,
        (raw, name) => {
          if (name[0] !== "#")
            return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : raw;
          const hexadecimal = /^#[xX]/.test(name), number = Number.parseInt(
            name.slice(hexadecimal ? 2 : 1),
            hexadecimal ? 16 : 10
          );
          return number === 0 || number > 1114111 || number >= 55296 && number <= 57343 ? "�" : String.fromCodePoint(number);
        }
      );
    }
    function sourceUrl(value) {
      try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : null;
      } catch {
        return null;
      }
    }
    function markdownLinkStart(value, parser) {
      const rules = parser.tokenizer.rules.inline;
      if (rules.link.test(value)) return true;
      const reference = rules.reflink.exec(value) || rules.nolink.exec(value);
      if (!reference) return false;
      const label = (reference[2] || reference[1]).replace(/\s+/g, " ").trim().toLowerCase().toUpperCase().toLowerCase();
      return Object.prototype.hasOwnProperty.call(parser.tokens.links, label);
    }
    function urlTokenEnd(value, start, parser) {
      let end = start, parentheses = 0, brackets = 0, backslashes = 0;
      for (; end < value.length; end++) {
        const char = value[end], escaped = backslashes % 2 === 1;
        backslashes = char === "\\" ? backslashes + 1 : 0;
        if (/[\s<>"'`，。！？；：、（）【】《》「」『』“”‘’…]/u.test(char))
          break;
        if (char === "[" && !escaped && !parentheses && !brackets && markdownLinkStart(value.slice(end), parser))
          break;
        if (char === "(") parentheses++;
        else if (char === ")") {
          if (!parentheses) break;
          parentheses--;
        } else if (char === "[") brackets++;
        else if (char === "]") {
          if (!brackets) break;
          brackets--;
        }
      }
      while (end > start && /[.,;:!?]/.test(value[end - 1])) end--;
      return end;
    }
    const lexer = marked?.Marked ? new marked.Marked({ gfm: true, breaks: true }) : null;
    if (lexer && cjkFriendly) lexer.use(cjkFriendly());
    if (lexer && math)
      lexer.use({
        extensions: [
          {
            name: "gfMath",
            level: "inline",
            start: math.start,
            tokenizer: math.tokenizeInline
          },
          {
            name: "gfMathBlock",
            level: "block",
            tokenizer: math.tokenizeBlock
          }
        ]
      });
    lexer?.use({
      extensions: [
        {
          name: "gfUrl",
          level: "inline",
          start(src) {
            const match = /https?:\/\//i.exec(src);
            return match ? match.index : void 0;
          },
          tokenizer(src) {
            if (!/^https?:\/\//i.test(src)) return void 0;
            const raw = src.slice(0, urlTokenEnd(src, 0, this.lexer));
            if (!raw) return void 0;
            if (this.lexer.state.inLink) return void 0;
            return { type: "gfUrl", raw, text: raw, href: raw };
          }
        }
      ]
    });
    function render(target, text) {
      const value = String(text ?? "").slice(0, LIMITS.text);
      try {
        let budget = function(depth, token = false) {
          if (depth > LIMITS.depth || (token ? ++state.tokens > LIMITS.tokens : ++state.nodes > LIMITS.nodes))
            throw new Error("Markdown rendering limit");
        }, element = function(tag) {
          budget(0);
          return document.createElement(tag);
        }, appendText = function(parent, value2, decode = false) {
          const text2 = decode ? decodeEntities(value2) : String(value2 ?? "");
          if (!text2) return;
          budget(0);
          parent.append(document.createTextNode(text2));
        }, appendMath = function(parent, token) {
          const node = !token.pending && ++state.formulas <= 64 && math?.render(document, token.text, token.display);
          if (node) {
            const count = (current) => 1 + Array.from(current.childNodes || []).reduce(
              (sum, child) => sum + count(child),
              0
            );
            const size = count(node);
            if (state.nodes + size <= LIMITS.nodes) {
              state.nodes += size;
              parent.append(node);
              return;
            }
          }
          appendText(parent, token.raw);
        }, inline = function(parent, tokens, depth = 0, inLink = false) {
          for (const token of tokens || []) {
            budget(depth, true);
            switch (token.type) {
              case "gfMath":
                appendMath(parent, token);
                break;
              case "text":
                if (Array.isArray(token.tokens))
                  inline(parent, token.tokens, depth + 1, inLink);
                else appendText(parent, token.raw ?? token.text, true);
                break;
              case "escape":
                appendText(parent, token.text, true);
                break;
              case "html":
              case "image":
                appendText(parent, token.raw);
                break;
              case "strong":
              case "em":
              case "del": {
                const node = element(token.type);
                inline(node, token.tokens, depth + 1, inLink);
                parent.append(node);
                break;
              }
              case "codespan": {
                const node = element("code");
                appendText(node, token.text);
                parent.append(node);
                break;
              }
              case "br":
                parent.append(element("br"));
                appendText(parent, "\n");
                break;
              case "link":
              case "gfUrl": {
                const href = decodeEntities(token.href), url = sourceUrl(href);
                if (!url || inLink) {
                  appendText(parent, token.raw);
                  break;
                }
                const node = element("a");
                node.href = href;
                node.target = "_blank";
                node.rel = "noopener noreferrer";
                if (token.title) node.title = decodeEntities(token.title);
                if (Array.isArray(token.tokens))
                  inline(node, token.tokens, depth + 1, true);
                else appendText(node, token.text ?? token.raw, true);
                if (token.type === "link" && /^\[\d{1,2}\]$/.test(token.text || "")) {
                  const sup = element("sup");
                  sup.className = "md-citation";
                  sup.append(node);
                  parent.append(sup);
                } else parent.append(node);
                break;
              }
              case "checkbox":
                appendText(parent, token.checked ? "[x] " : "[ ] ");
                break;
              default:
                appendText(parent, token.raw ?? token.text);
            }
          }
        }, blocks = function(parent, tokens, depth = 0, tight = false) {
          for (const token of tokens || []) {
            budget(depth, true);
            switch (token.type) {
              case "gfMathBlock":
                appendMath(parent, token);
                break;
              case "space":
                appendText(parent, token.raw);
                break;
              case "def":
                break;
              // Definitions are metadata for reference links.
              case "paragraph": {
                const node = element("p");
                inline(node, token.tokens, depth + 1);
                parent.append(node);
                break;
              }
              case "heading": {
                const level = Math.max(
                  1,
                  Math.min(6, Number(token.depth) || 1)
                ), node = element("h" + level);
                inline(node, token.tokens, depth + 1);
                parent.append(node);
                break;
              }
              case "text": {
                const node = tight ? parent : element("p");
                if (Array.isArray(token.tokens))
                  inline(node, token.tokens, depth + 1);
                else appendText(node, token.text ?? token.raw, true);
                if (!tight) parent.append(node);
                break;
              }
              case "blockquote": {
                const node = element("blockquote");
                blocks(node, token.tokens, depth + 1);
                parent.append(node);
                break;
              }
              case "code": {
                const node = element("pre"), code = element("code");
                appendText(code, token.text);
                node.append(code);
                parent.append(node);
                break;
              }
              case "hr":
                parent.append(element("hr"));
                break;
              case "list": {
                const node = element(token.ordered ? "ol" : "ul"), start = Number(token.start);
                if (token.ordered && Number.isInteger(start) && start !== 1 && start >= 0 && start <= 999999999)
                  node.setAttribute("start", String(start));
                for (const [index, item] of (token.items || []).entries()) {
                  budget(depth + 1, true);
                  if (index) appendText(node, "\n");
                  const li = element("li");
                  blocks(li, item.tokens, depth + 1, !item.loose);
                  node.append(li);
                }
                parent.append(node);
                break;
              }
              case "table": {
                const table = element("table"), head = element("thead"), body = element("tbody");
                const row = (cells, header) => {
                  const tr = element("tr");
                  for (const [index, cell] of (cells || []).entries()) {
                    budget(depth + 1, true);
                    const td = element(header ? "th" : "td"), align = cell.align ?? token.align?.[index];
                    if (header) td.setAttribute("scope", "col");
                    if (["left", "center", "right"].includes(align))
                      td.className = "md-align-" + align;
                    inline(td, cell.tokens, depth + 1);
                    tr.append(td);
                  }
                  return tr;
                };
                head.append(row(token.header, true));
                for (const cells of token.rows || [])
                  body.append(row(cells, false));
                table.append(head, body);
                parent.append(table);
                break;
              }
              case "html":
              case "image":
                appendText(parent, token.raw);
                break;
              case "checkbox":
                appendText(parent, token.checked ? "[x] " : "[ ] ");
                break;
              default:
                appendText(parent, token.raw ?? token.text);
            }
          }
        };
        const document = target.ownerDocument || root.document;
        if (!lexer || !document)
          throw new Error("Markdown renderer unavailable");
        const state = { nodes: 0, tokens: 0, formulas: 0 };
        const staging = element("div");
        blocks(staging, lexer.lexer(value));
        target.replaceChildren(...staging.childNodes);
      } catch {
        target.textContent = value;
      }
    }
    return Object.freeze({ render, LIMITS });
  }
);
