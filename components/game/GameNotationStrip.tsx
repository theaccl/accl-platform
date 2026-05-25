type Props = {
  /** SAN movetext line (e.g. "1. e4 e5 2. Nf3"). Empty string reserves slot with placeholder. */
  movetext: string;
  placeholder?: string;
  /** When true, placeholder reads as finished with no recorded moves. */
  finished?: boolean;
};

/**
 * Fixed-height move notation strip — always mounted on game pages so the board column
 * does not reflow when the first move arrives.
 */
export function GameNotationStrip({
  movetext,
  placeholder = 'Moves will appear here.',
  finished = false,
}: Props) {
  const emptyLabel = finished ? 'No moves recorded.' : placeholder;
  const hasText = movetext.trim().length > 0;

  return (
    <div
      className="accl-game-notation-strip accl-scroll-no-anchor"
      data-testid="game-notation-strip"
      aria-label={hasText ? 'Move notation' : 'Move notation placeholder'}
      aria-live="polite"
    >
      {hasText ? (
        <span className="accl-game-notation-strip__text">{movetext}</span>
      ) : (
        <span className="accl-game-notation-strip__placeholder">{emptyLabel}</span>
      )}
    </div>
  );
}
