// Builders for constructing `FigmaNode`-shaped mock trees in tests, without
// needing to satisfy the full real `@figma/plugin-typings` node interfaces.
import type {
  FigmaComponentPropertyValue,
  FigmaNode,
  FigmaStyledTextSegment,
} from "../extractor/types.js";

let autoId = 0;
function nextId(): string {
  autoId += 1;
  return `test:${autoId}`;
}

export function resetAutoIds(): void {
  autoId = 0;
}

export function mockNode(
  overrides: Partial<FigmaNode> & { type: string; name: string },
): FigmaNode {
  return {
    id: overrides.id ?? nextId(),
    visible: true,
    ...overrides,
  } as FigmaNode;
}

export function mockFrame(overrides: Partial<FigmaNode> & { name: string }): FigmaNode {
  return mockNode({ type: "FRAME", ...overrides });
}

export function mockGroup(overrides: Partial<FigmaNode> & { name: string }): FigmaNode {
  return mockNode({ type: "GROUP", ...overrides });
}

export function mockVector(overrides: Partial<FigmaNode> & { name: string }): FigmaNode {
  return mockNode({ type: "VECTOR", ...overrides });
}

export function mockText(
  characters: string,
  segments: FigmaStyledTextSegment[],
  overrides: Partial<FigmaNode> & { name?: string } = {},
): FigmaNode {
  return mockNode({
    type: "TEXT",
    name: overrides.name ?? characters,
    characters,
    getStyledTextSegments: () => segments,
    ...overrides,
  });
}

export function mockComponentSet(overrides: Partial<FigmaNode> & { name: string }): FigmaNode {
  return mockNode({ type: "COMPONENT_SET", ...overrides });
}

export function mockComponent(
  overrides: Partial<FigmaNode> & { name: string; parent?: FigmaNode | null },
): FigmaNode {
  return mockNode({ type: "COMPONENT", ...overrides });
}

export function mockInstance(
  overrides: Partial<FigmaNode> & {
    name: string;
    mainComponent: FigmaNode | null;
    componentProperties?: Record<string, FigmaComponentPropertyValue>;
  },
): FigmaNode {
  const { mainComponent, ...rest } = overrides;
  return mockNode({
    type: "INSTANCE",
    getMainComponentAsync: async () => mainComponent,
    ...rest,
  });
}
