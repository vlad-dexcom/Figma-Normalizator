// Hard cap on total nodes visited per export, plus cooperative yielding so a
// large screen doesn't hang the plugin sandbox's single JS thread. See
// concern #9 in the plugin-extractor task description.

/** Thrown when a single extraction visits more nodes than the budget allows. */
export class NodeBudgetExceededError extends Error {
  constructor(public readonly limit: number) {
    super(
      `Figma Normalizator: this selection has more than ${limit} nodes. ` +
        `Extraction was stopped rather than silently truncating the output — ` +
        `select a smaller region, or split the export into multiple smaller selections.`,
    );
    this.name = "NodeBudgetExceededError";
  }
}

export const DEFAULT_NODE_BUDGET = 5000;

/** How many nodes to visit between cooperative yields back to the event loop. */
const YIELD_EVERY = 200;

export class NodeBudget {
  private visited = 0;

  constructor(private readonly limit: number = DEFAULT_NODE_BUDGET) {}

  /** Call once per node visited. Throws if the budget is exceeded. */
  async tick(): Promise<void> {
    this.visited += 1;
    if (this.visited > this.limit) {
      throw new NodeBudgetExceededError(this.limit);
    }
    if (this.visited % YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  get count(): number {
    return this.visited;
  }
}
