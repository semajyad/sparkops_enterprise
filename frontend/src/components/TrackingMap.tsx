"use client";

import L, { DivIcon } from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

export type Coordinate = {
  lat: number;
  lng: number;
};

export type MapJob = {
  id: string;
  clientName: string;
  timeLabel: string;
  addressLabel: string;
  coordinate: Coordinate;
  navigateUrl: string;
};

export type StaffLocation = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  initials: string;
  coordinate: Coordinate;
  isStale: boolean;
};

export type RouteLine = {
  id: string;
  points: [number, number][];
  color: string;
};

type TrackingMapProps = {
  current: Coordinate;
  jobs: MapJob[];
  staffLocations: StaffLocation[];
  routeLines: RouteLine[];
  selectedJobId: string | null;
  isDarkTheme: boolean;
  recenterSignal: number;
  onJobSelect: (jobId: string) => void;
};

function FollowCurrentLocation({ current, recenterSignal }: { current: Coordinate; recenterSignal: number }): null {
  const map = useMap();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;
    map.flyTo([current.lat, current.lng], map.getZoom(), {
      animate: true,
      duration: 0.8,
    });
  }, [current.lat, current.lng, map]);

  useEffect(() => {
    if (recenterSignal <= 0) {
      return;
    }

    map.flyTo([current.lat, current.lng], map.getZoom(), {
      animate: true,
      duration: 0.8,
    });
  }, [recenterSignal, current.lat, current.lng, map]);

  return null;
}

function avatarIcon(location: StaffLocation): DivIcon {
  const avatarHtml = location.avatarUrl
    ? `<div style="width:100%;height:100%;background-image:url('${location.avatarUrl}');background-size:cover;background-position:center;"></div>`
    : `<div class="map-avatar-fallback">${location.initials}</div>`;

  return L.divIcon({
    className: `map-avatar-marker ${location.isStale ? "opacity-50" : ""}`,
    html: avatarHtml,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function youIcon(): DivIcon {
  return L.divIcon({
    className: "sparkops-you-marker-wrapper",
    html: '<div class="sparkops-you-marker"><span class="sparkops-you-core"></span></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function TrackingMap({ current, jobs, staffLocations, routeLines, selectedJobId, isDarkTheme, recenterSignal, onJobSelect }: TrackingMapProps): React.JSX.Element {
  const center: [number, number] = [current.lat, current.lng];
  const tileUrl = isDarkTheme
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  const markers = useMemo(
    () =>
      staffLocations.map((location) => ({
        ...location,
        icon: avatarIcon(location),
      })),
    [staffLocations],
  );

  return (
    <div className="tracking-map-shell absolute left-0 top-0 z-0 h-screen w-screen overflow-hidden">
      <MapContainer center={center} zoom={14} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
          url={tileUrl}
        />
        <FollowCurrentLocation current={current} recenterSignal={recenterSignal} />

        {routeLines.map((line) => (
          <Polyline key={line.id} positions={line.points} pathOptions={{ color: line.color, weight: 4, opacity: 0.75 }} />
        ))}

        <Marker position={center} icon={youIcon()}>
          <Tooltip direction="top" offset={[0, -8]} permanent>
            You
          </Tooltip>
        </Marker>

        {markers.map((location) => (
          <Marker key={location.userId} position={[location.coordinate.lat, location.coordinate.lng]} icon={location.icon}>
            <Tooltip direction="top" offset={[0, -12]}>{location.name}</Tooltip>
          </Marker>
        ))}

        {jobs.map((job) => (
          <CircleMarker
            key={job.id}
            center={[job.coordinate.lat, job.coordinate.lng]}
            radius={selectedJobId === job.id ? 10 : 8}
            pathOptions={{
              color: selectedJobId === job.id ? "#fb7185" : "#f59e0b",
              fillColor: selectedJobId === job.id ? "#fb7185" : "#f59e0b",
              fillOpacity: 0.9,
            }}
            eventHandlers={{ click: () => onJobSelect(job.id) }}
          >
            <Tooltip direction="top" offset={[0, -8]}>{job.clientName}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
