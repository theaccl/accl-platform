type VerticalBounds = {
  top: number;
  bottom: number;
};

export function replayMoveScrollDelta(
  container: VerticalBounds,
  activeMove: VerticalBounds
): number {
  if (activeMove.top < container.top) {
    return activeMove.top - container.top;
  }
  if (activeMove.bottom > container.bottom) {
    return activeMove.bottom - container.bottom;
  }
  return 0;
}

/** Keep the selected replay move visible without moving the page viewport. */
export function keepReplayMoveVisible(
  container: HTMLElement,
  activeMove: HTMLElement
): void {
  const delta = replayMoveScrollDelta(
    container.getBoundingClientRect(),
    activeMove.getBoundingClientRect()
  );
  if (delta !== 0) {
    container.scrollTop += delta;
  }
}
