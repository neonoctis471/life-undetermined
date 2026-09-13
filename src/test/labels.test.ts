import { describe, expect, it } from "vitest";

import { formatVoteCount } from "@/game/labels";

describe("formatVoteCount", () => {
  it("writes small counts plainly", () => {
    expect(formatVoteCount(1)).toBe("1");
    expect(formatVoteCount(76)).toBe("76");
    expect(formatVoteCount(9_999)).toBe("9999");
  });

  it("switches to 万 once the exact figure stops meaning anything", () => {
    expect(formatVoteCount(10_000)).toBe("1 万");
    expect(formatVoteCount(11_400)).toBe("1.1 万");
    expect(formatVoteCount(123_456)).toBe("12.3 万");
  });

  it("drops a trailing .0 rather than printing 12.0 万", () => {
    expect(formatVoteCount(120_000)).toBe("12 万");
  });

  it("treats absent, zero and nonsense counts as nothing to show", () => {
    expect(formatVoteCount(0)).toBe("0");
    expect(formatVoteCount(-5)).toBe("0");
    expect(formatVoteCount(Number.NaN)).toBe("0");
  });
});
