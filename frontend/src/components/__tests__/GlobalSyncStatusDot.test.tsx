import { describe, expect, it } from "@jest/globals";

import { getDotRouteContext, resolveDotIndicator } from "@/components/GlobalSyncStatusDot";

describe("GlobalSyncStatusDot route logic", () => {
  it("quarantines office routes", () => {
    const context = getDotRouteContext("/admin");
    const indicator = resolveDotIndicator({
      ...context,
      gpsStatus: "searching",
    });

    expect(context.isMapRoute).toBe(false);
    expect(indicator).toBeNull();
  });

  it("quarantines capture routes", () => {
    const context = getDotRouteContext("/capture");
    const indicator = resolveDotIndicator({
      ...context,
      gpsStatus: "searching",
    });

    expect(context.isMapRoute).toBe(false);
    expect(indicator).toBeNull();
  });

  it("returns map gps indicator on tracking route", () => {
    const context = getDotRouteContext("/tracking");
    const indicator = resolveDotIndicator({
      ...context,
      gpsStatus: "ready",
    });

    expect(indicator?.label).toBe("GPS status: Location found");
  });
});
