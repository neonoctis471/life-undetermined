/** The fork mark: a bundle of lines gathers into one point, then splits into a black and a green line. */
export function ForkMark({ size = 22 }: { size?: number }) {
  const rays = [-3, -2, -1, 0, 1, 2, 3];
  return (
    <svg className="fork-mark" width={size * 1.7} height={size} viewBox="0 0 51 30" aria-hidden="true" focusable="false">
      {rays.map((ray) => (
        <path
          key={ray}
          d={`M1 ${15 + ray * 3.6} C 11 ${15 + ray * 3.6}, 15 15, 24 15`}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
          opacity="0.5"
        />
      ))}
      <circle cx="24" cy="15" r="2.6" fill="currentColor" />
      <path d="M24 15 C 33 15, 38 7.5, 50 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M24 15 C 33 15, 38 22.5, 50 23.5" fill="none" stroke="var(--green)" strokeWidth="1.8" />
    </svg>
  );
}
