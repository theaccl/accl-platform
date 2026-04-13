import { test, expect } from "@playwright/test";

import type { NexusDataStateLabelProps } from "@/components/nexus/NexusDataStateLabel";
import NexusDataStateLabel from "@/components/nexus/NexusDataStateLabel";

test.describe("NEXUS Phase 6 data state label", () => {
  test("placeholder props are accepted", () => {
    const props: NexusDataStateLabelProps = { state: "placeholder", children: "Standing data not available" };
    expect(props.state).toBe("placeholder");
    expect(typeof NexusDataStateLabel).toBe("function");
  });
});
