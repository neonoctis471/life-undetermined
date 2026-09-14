import { describe, expect, it } from "vitest";

import { MAX_QUERIES, intentQueries, topUpQueries } from "@/zhihu/queries";

/*
 * The search occasionally answers a good query with nothing at all, and the
 * request contract accepts at most three. These cover that a lookup always
 * leaves with as many distinct, valid queries as it can get.
 */
describe("topUpQueries", () => {
  it("keeps the situation's own queries first", () => {
    expect(topUpQueries(["作品集赶工还是打磨"], ["毕业后跨专业求职", "毕业后学剪辑"])).toEqual([
      "作品集赶工还是打磨",
      "毕业后跨专业求职",
      "毕业后学剪辑",
    ]);
  });

  it("stops at the three the contract allows", () => {
    expect(topUpQueries(["一", "二", "三"].map((n) => `毕业后${n}件事`), ["毕业后第四件事"])).toHaveLength(MAX_QUERIES);
  });

  it("never repeats a query, however it was spelled", () => {
    expect(topUpQueries(["毕业后学剪辑"], [" 毕业后学剪辑 ", "毕业后跨专业求职"])).toEqual([
      "毕业后学剪辑",
      "毕业后跨专业求职",
    ]);
  });

  it("drops anything the request schema would reject", () => {
    expect(topUpQueries(["", " ", "短", "毕业后帮家里做生意", "长".repeat(41)], [])).toEqual(["毕业后帮家里做生意"]);
  });

  it("returns what it has when there is nothing to top up with", () => {
    expect(topUpQueries(["毕业后学剪辑"], [])).toEqual(["毕业后学剪辑"]);
    expect(topUpQueries([], [])).toEqual([]);
  });
});

describe("intentQueries", () => {
  it("builds broad queries from what the player said they wanted", () => {
    expect(intentQueries({ goals: ["帮家里做生意", "学剪辑"], currentActions: ["拍第一条视频"] })).toEqual([
      "毕业后帮家里做生意",
      "毕业后学剪辑",
      "毕业后拍第一条视频",
    ]);
  });

  it("leaves out anything too long to send", () => {
    expect(intentQueries({ goals: ["方向".repeat(20)], currentActions: ["学剪辑"] })).toEqual(["毕业后学剪辑"]);
  });
});
