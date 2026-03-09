"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import { useMap } from "react-leaflet";

type Coordinate = {
  lat: number;
  lng: number;
};

type MapJob = {
  id: string;
  clientName: string;
  timeLabel: string;
  coordinate: Coordinate;
  navigateUrl: string;
};

type TrackingMapProps = {
  current: Coordinate;
  jobs: MapJob[];
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

export function TrackingMap({ current, jobs }: TrackingMapProps): React.JSX.Element {
  const center: [number, number] = [current.lat, current.lng];

  return (
    <div className="tracking-map-shell relative z-0 h-[380px] w-full overflow-hidden rounded-2xl">
      <MapContainer center={center} zoom={14} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FollowCurrentLocation current={current} />

        <CircleMarker center={center} radius={8} pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.9 }}>
          <Tooltip direction="top" offset={[0, -8]} permanent>
            Your Van
          </Tooltip>
        </CircleMarker>

        {jobs.map((job) => (
          <CircleMarker
            key={job.id}
            center={[job.coordinate.lat, job.coordinate.lng]}
            radius={8}
            pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.85 }}
          >
            <Popup>
              <article className="min-w-[180px] text-slate-900">
                <p className="text-sm font-semibold">{job.clientName}</p>
                <p className="mt-1 text-xs text-slate-600">{job.timeLabel}</p>
                <a
                  href={job.navigateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
                >
                  Navigate
                </a>
              </article>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
