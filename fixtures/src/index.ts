// Entry point for the captured Figma node fixture corpus and expected IR
// snapshots. See fixtures/README.md for the corpus overview and the
// snapshot-update workflow.
export type { FixtureScenario } from "./scenario.js";
export { expectedIrPath } from "./scenario.js";
export { runScenario } from "./runScenario.js";
export { scenarios } from "./corpus/index.js";
