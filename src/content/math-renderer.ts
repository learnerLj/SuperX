import katex from "katex";

const MATH_NS = "http://www.w3.org/1998/Math/MathML";
export const LIMITS = Object.freeze({ expression: 4096, nodes: 1500, depth: 40, expansions: 200 });
export interface MathToken { type: "gfMath"; raw: string; text: string; display: boolean; pending?: boolean }
const tags = new Set("math semantics mrow mi mn mo mspace mtext mfrac msqrt mroot mstyle mtable mtr mtd mover munder munderover msub msup msubsup mpadded mphantom menclose mmultiscripts mprescripts none merror".split(" "));
const attributes = new Set("display displaystyle scriptlevel mathvariant mathsize mathcolor mathbackground stretchy symmetric fence separator largeop movablelimits accent accentunder lspace rspace width height depth voffset linethickness notation columnalign rowalign columnspacing rowspacing columnlines rowlines columnspan rowspan".split(" "));
const explicitTex = /\\(?:sqrt|frac|dfrac|tfrac|log|sum|prod|int|lim|begin|alpha|beta|theta|sigma|Omega|Theta)\b/;
const mathStart = new RegExp(String.raw`\\[([]|\$|\((?=[^\n]*${explicitTex.source})`);

function escaped(source: string, index: number): boolean {
  let count = 0;
  while (index > 0 && source[--index] === "\\") count++;
  return count % 2 === 1;
}
function closing(source: string, delimiter: string, from: number): number {
  let index = source.indexOf(delimiter, from);
  while (index !== -1 && escaped(source, index)) index = source.indexOf(delimiter, index + delimiter.length);
  return index;
}
export function start(source: string): number | undefined {
  const match = mathStart.exec(source);
  return match?.index;
}
export function tokenizeInline(source: string): MathToken | undefined {
  const open = source.startsWith("\\(") ? "\\(" : source.startsWith("\\[") ? "\\[" : source.startsWith("$$") ? "$$" : source.startsWith("$") ? "$" : "";
  if (open) {
    const close = open === "\\(" ? "\\)" : open === "\\[" ? "\\]" : open;
    const end = closing(source, close, open.length), display = open === "$$" || open === "\\[";
    if (open === "$") {
      if (end < 0 && !/\s/.test(source[1] || " ") && /[\\^_{}=]/.test(source) && !/[\n`]/.test(source)) {
        return { type: "gfMath", raw: source, text: source, display, pending: true };
      }
      if (/\s/.test(source[1] || " ") || end < 0 || /\s/.test(source[end - 1] || " ") || /\d/.test(source[end + 1] || "")) return undefined;
      // Currency amounts and paired price mentions are prose, not TeX.
      const body = source.slice(1, end);
      if (/^\d[\d,.]*(?:\s|[，；：、！？])/.test(body) && !/[\\^_{}=]/.test(body)) return undefined;
      if (body.includes("\n") || body.includes("`")) return undefined;
    }
    if (end < 0) {
      // Preserve TeX backslashes until a streamed delimiter closes.
      if (open === "$") return undefined;
      return { type: "gfMath", raw: source, text: source, display, pending: true };
    }
    const raw = source.slice(0, end + close.length), text = source.slice(open.length, end).trim();
    if (!text) return { type: "gfMath", raw, text: raw, display, pending: true };
    return { type: "gfMath", raw, text, display };
  }
  // Some website answers lose the \( delimiters and keep ordinary parentheses.
  // Recover only balanced groups containing an explicit TeX command.
  if (!source.startsWith("(")) return undefined;
  let depth = 0;
  for (let index = 0; index < Math.min(source.length, LIMITS.expression + 2); index++) {
    const character = source[index];
    if (character === "\n") break;
    if (escaped(source, index)) continue;
    if (character === "(") depth++;
    if (character === ")" && --depth === 0) {
      const raw = source.slice(0, index + 1), text = raw.slice(1, -1);
      return explicitTex.test(text) ? { type: "gfMath", raw, text, display: false } : undefined;
    }
  }
  if (explicitTex.test(source)) return { type: "gfMath", raw: source, text: source, display: false, pending: true };
  return undefined;
}
export function tokenizeBlock(source: string): (Omit<MathToken, "type"> & { type: "gfMathBlock" }) | undefined {
  if (!source.startsWith("$$") && !source.startsWith("\\[")) return undefined;
  const token = tokenizeInline(source);
  if (!token || token.pending) return undefined;
  return { ...token, type: "gfMathBlock" };
}

export function render(document: Document, expression: string, display = false): HTMLElement | null {
  if (!expression.trim() || expression.length > LIMITS.expression) return null;
  try {
    const Parser = document.defaultView?.DOMParser;
    if (!Parser) return null;
    const markup = katex.renderToString(expression, { output: "mathml", displayMode: display, trust: false,
      throwOnError: true, strict: "error", maxExpand: LIMITS.expansions, maxSize: 20, macros: {} });
    const parsed = new Parser().parseFromString(markup, "application/xml");
    if (parsed.getElementsByTagName("parsererror").length) return null;
    const math = parsed.getElementsByTagName("math")[0];
    if (!math) return null;
    let count = 0;
    function copy(input: Node, depth: number): Node | null {
      if (++count > LIMITS.nodes || depth > LIMITS.depth) throw new Error("Math rendering limit");
      if (input.nodeType === 3) return document.createTextNode(input.textContent || "");
      if (input.nodeType !== 1) return null;
      const source = input as Element, name = source.localName;
      if (name === "annotation") return null;
      if (source.namespaceURI !== MATH_NS || !tags.has(name)) throw new Error("Unexpected MathML");
      const node = document.createElementNS(MATH_NS, name);
      for (const attribute of Array.from(source.attributes)) {
        if (attributes.has(attribute.name) && attribute.value.length <= 256 && !/url\s*\(|javascript:|data:/i.test(attribute.value)) node.setAttribute(attribute.name, attribute.value);
      }
      for (const child of Array.from(source.childNodes)) { const result = copy(child, depth + 1); if (result) node.appendChild(result); }
      return node;
    }
    const node = copy(math, 0);
    if (!node) return null;
    const wrapper = document.createElement("span");
    wrapper.className = display ? "md-math md-math-block" : "md-math";
    wrapper.style.display = display ? "block" : "inline-block";
    wrapper.style.maxWidth = "100%"; wrapper.style.overflowX = "auto";
    wrapper.style.verticalAlign = "middle";
    if (display) { wrapper.style.margin = "0.6em 0"; wrapper.style.textAlign = "center"; }
    wrapper.appendChild(node);
    return wrapper;
  } catch { return null; }
}
