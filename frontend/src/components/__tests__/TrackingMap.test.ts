import { getTrackingTileConfig } from "@/lib/trackingMapConfig";

describe("TrackingMap tile configuration", () => {
  it("uses Mapbox Light tiles when Mapbox is enabled", () => {
    const config = getTrackingTileConfig("pk.test_token", true);

    expect(config.url).toBe(
      "https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=pk.test_token",
    );
    expect(config.attribution).toContain("Mapbox");
  });

  it("falls back to Carto Positron tiles when Mapbox is disabled", () => {
    const config = getTrackingTileConfig("", false);

    expect(config.url).toBe("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png");
    expect(config.attribution).toContain("CARTO");
  });
});
