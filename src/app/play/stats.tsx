import { GRADUATION_STATS, NO_DATA_TEXT, STATS_CAPTION } from "./graduation-stats";

/**
 * Act 1, block 04 (left). Each figure stands on its own source line — these are
 * separate survey results, not slices of one pie, so they are never totalled.
 */
export function GraduationStats() {
  return (
    <div className="stats">
      <ul className="stat-list">
        {GRADUATION_STATS.map((stat) => (
          <li className="stat-card" key={stat.label}>
            <p className={stat.value ? "stat-value" : "stat-value stat-value-empty"}>{stat.value ?? NO_DATA_TEXT}</p>
            <p className="stat-label">{stat.label}</p>
            <p className="stat-source">
              {stat.cohort} · {stat.scope}
              <br />
              <a href={stat.sourceUrl} target="_blank" rel="noopener noreferrer">
                {stat.sourceName}
              </a>
              <br />
              {stat.note}
            </p>
          </li>
        ))}
      </ul>
      <p className="muted">{STATS_CAPTION}</p>
    </div>
  );
}
