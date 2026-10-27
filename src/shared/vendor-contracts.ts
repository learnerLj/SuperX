/** Only the public lexer surface used by our inert Markdown DOM renderer. */
export interface MarkdownToken {
  type: string;
  raw: string;
  text?: string;
  tokens?: MarkdownToken[];
  depth?: number;
  href?: string;
  title?: string | null;
  checked?: boolean;
  ordered?: boolean;
  start?: string | number;
  loose?: boolean;
  items?: MarkdownToken[];
  header?: MarkdownCell[];
  rows?: MarkdownCell[][];
  align?: (string | null)[];
  display?: boolean;
  pending?: boolean;
}
export interface MarkdownCell {
  text?: string;
  tokens: MarkdownToken[];
  align?: string | null;
}
export interface LexerContext {
  tokenizer: {
    rules: { inline: { link: RegExp; reflink: RegExp; nolink: RegExp } };
  };
  tokens: { links: Record<string, unknown> };
  state: { inLink: boolean };
}
export interface MarkedExtension {
  extensions?: {
    name: string;
    level: string;
    start?(source: string): number | undefined;
    tokenizer(
      this: { lexer: LexerContext },
      source: string,
    ): Partial<MarkdownToken> | undefined;
  }[];
}
export interface MarkedLibrary {
  Marked: new (options: { gfm: boolean; breaks: boolean }) => {
    use(extension: MarkedExtension): void;
    lexer(text: string): MarkdownToken[];
  };
}
export type CJKFriendly = () => MarkedExtension;
