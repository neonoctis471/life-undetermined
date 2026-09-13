/*
 * ↗ (U+2197) has an emoji variant, and iOS resolves it to the colour emoji font
 * rather than to text — on a phone the title's arrow came out as a grey rounded
 * tile. Drawing it instead of typing it removes the font from the question
 * entirely. It sizes and colours itself from whatever the parent already sets,
 * so every existing rule about these arrows still applies.
 */
export function ArrowUpRight({ weight = "regular" }: { weight?: "regular" | "heavy" }) {
  return (
    <svg
      className="glyph-arrow"
      viewBox="0 0 100 100"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth={weight === "heavy" ? 17 : 9} strokeLinecap="square">
        <path d="M25 75 L75 25" />
        <path d="M41 25 H75 V59" />
      </g>
    </svg>
  );
}
