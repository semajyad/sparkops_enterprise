export type TrackingTileConfig = {
  url: string;
  attribution: string;
};

export function getTrackingTileConfig(mapboxToken: string, useMapboxTiles: boolean): TrackingTileConfig {
  const mapboxTileUrl = `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${mapboxToken}`;
  const cartoPositronTileUrl = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  if (useMapboxTiles) {
    return {
      url: mapboxTileUrl,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>',
    };
  }

  return {
    url: cartoPositronTileUrl,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  };
}
