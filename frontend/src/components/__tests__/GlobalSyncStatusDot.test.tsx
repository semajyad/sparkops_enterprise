import { describe, expect, it } from "@jest/globals";

import { getDotRouteContext, resolveDotIndicator } from "@/components/GlobalSyncStatusDot";

describe("GlobalSyncStatusDot route logic", () => {
  it("quarantines office routes", () => {
    const context = getDotRouteContext("/admin");
    const indicator = resolveDotIndicator({
      ...context,
      gpsStatus: "searching",
      isOnline: true,
    });

    expect(context.isMapRoute).toBe(false);
    expect(context.isCaptureRoute).toBe(false);
    expect(indicator).toBeNull();
  });

  it("returns capture network indicator on capture route", () => {
    const context = getDotRouteContext("/capture");
    const indicator = resolveDotIndicator({
      ...context,
      gpsStatus: "searching",
      isOnline: false,
    });

    expect(indicator?.label).toBe("Network status: Offline");
  });

  it("returns map gps indicator on tracking route", () => {
    const context = getDotRouteContext("/tracking");
    const indicator = resolveDotIndicator({
      ...context,
      gpsStatus: "ready",
      isOnline: true,
    });

    expect(indicator?.label).toBe("GPS status: Location found");
  });
});
