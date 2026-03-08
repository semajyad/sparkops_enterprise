"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import { useMap } from "react-leaflet";

type Coordinate = {
  lat: number;
  lng: number;
};

type TrackingMapProps = {
  current: Coordinate;
  nextJob: Coordinate;
};

function FollowCurrentLocation({ current }: { current: Coordinate }): null {
  const map = useMap();

  useEffect(() => {
    map.flyTo([current.lat, current.lng], map.getZoom(), {
      animate: true,
      duration: 0.8,
    });
  }, [current.lat, current.lng, map]);

  return null;
}

export function TrackingMap({ current, nextJob }: TrackingMapProps): React.JSX.Element {
  const center: [number, number] = [current.lat, current.lng];
  const next: [number, number] = [nextJob.lat, nextJob.lng];

  return (
    <MapContainer center={center} zoom={14} className="h-[380px] w-full rounded-2xl" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FollowCurrentLocation current={current} />

      <CircleMarker center={center} radius={8} pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.9 }}>
        <Tooltip direction="top" offset={[0, -8]} permanent>
          Your Van
        </Tooltip>
      </CircleMarker>

      <CircleMarker center={next} radius={8} pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.9 }}>
        <Tooltip direction="top" offset={[0, -8]} permanent>
          Next Job
        </Tooltip>
      </CircleMarker>

      <Polyline positions={[center, next]} pathOptions={{ color: "#f59e0b", weight: 4, opacity: 0.7 }} />
    </MapContainer>
  );
}
