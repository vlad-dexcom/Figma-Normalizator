// The full fixture corpus: every scenario used by both the snapshot test
// (`src/__tests__/snapshot.test.ts`) and the schema-validation test
// (`src/__tests__/schema-validation.test.ts`), plus the `fixtures:update`
// regeneration script. Add new scenarios here.
import type { FixtureScenario } from "../scenario.js";
import { cardWithButton } from "./card-with-button/input.mock.js";
import { instanceList } from "./instance-list/input.mock.js";
import { rowWithIconAndAccordion } from "./row-with-icon-and-accordion/input.mock.js";
import { overlayBadgeOverAvatar } from "./overlay-badge-over-avatar/input.mock.js";
import { dashboardScreen } from "./dashboard-screen/input.mock.js";

export const scenarios: readonly FixtureScenario[] = [
  cardWithButton,
  instanceList,
  rowWithIconAndAccordion,
  overlayBadgeOverAvatar,
  dashboardScreen,
];
