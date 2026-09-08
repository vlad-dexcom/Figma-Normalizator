import { describe, expect, it } from "vitest";
import { NodeBudget, NodeBudgetExceededError } from "../budget.js";

describe("NodeBudget", () => {
  it("allows ticks up to the limit", async () => {
    const budget = new NodeBudget(3);
    await budget.tick();
    await budget.tick();
    await budget.tick();
    expect(budget.count).toBe(3);
  });

  it("throws NodeBudgetExceededError once the limit is exceeded", async () => {
    const budget = new NodeBudget(2);
    await budget.tick();
    await budget.tick();
    await expect(budget.tick()).rejects.toThrow(NodeBudgetExceededError);
  });
});
