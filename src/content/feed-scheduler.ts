export interface LookaheadCandidate {
  id: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Another mounted instance of the same post is currently visible. */
  visible: boolean;
  isPromoted: boolean;
}
export interface Viewport {
  width: number;
  height: number;
}
export interface LookaheadOptions {
  count: number;
  all: boolean;
}

/** A fixed spatial window, independent of request/completion status. */
export function selectLookahead(
  candidates: readonly LookaheadCandidate[],
  viewport: Viewport,
  options: LookaheadOptions,
): string[] {
  if (
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0 ||
    !Number.isFinite(viewport.width) ||
    viewport.width <= 0
  )
    return [];
  if (!options.all && (!Number.isFinite(options.count) || options.count < 1))
    return [];
  const valid = candidates.filter(
    (candidate) =>
      candidate.id.length > 0 &&
      !candidate.visible &&
      !candidate.isPromoted &&
      [candidate.top, candidate.bottom, candidate.left, candidate.right].every(
        Number.isFinite,
      ) &&
      candidate.top >= viewport.height &&
      candidate.bottom > candidate.top &&
      candidate.right > candidate.left &&
      candidate.right > 0 &&
      candidate.left < viewport.width,
  );
  valid.sort((a, b) => a.top - b.top);
  const ids = [...new Set(valid.map((candidate) => candidate.id))];
  return options.all ? ids : ids.slice(0, Math.trunc(options.count));
}
