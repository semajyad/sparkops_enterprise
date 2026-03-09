"use client";

import L, { DivIcon } from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

export type Coordinate = {
  lat: number;
  lng: number;
};

export type MapJob = {
  id: string;
  clientName: string;
  timeLabel: string;
  timePill: string;
  addressLabel: string;
  coordinate: Coordinate;
  navigateUrl: string;
  avatarUrl: string | null;
  initials: string;
  markerState: "done" | "active" | "pending";
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
  recenterSignal: number;
  onJobSelect: (jobId: string) => void;
};

function getMapboxToken(): string {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
}

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
    ? `<img src="${location.avatarUrl}" alt="${location.name}" />`
    : `<div class="map-avatar-fallback">${location.initials}</div>`;

  return L.divIcon({
    className: `map-avatar-marker ${location.isStale ? "opacity-50" : ""}`,
    html: avatarHtml,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function jobIcon(job: MapJob, selected: boolean): DivIcon {
  const stateClass =
    job.markerState === "done"
      ? "map-job-marker--done"
      : job.markerState === "active"
        ? "map-job-marker--active"
        : "map-job-marker--pending";

  const avatarHtml = job.avatarUrl
    ? `<img class="map-job-avatar" src="${escapeAttribute(job.avatarUrl)}" alt="${escapeAttribute(job.clientName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="map-job-avatar-fallback" style="display:none">${job.initials}</div>`
    : `<div class="map-job-avatar-fallback">${job.initials}</div>`;

  return L.divIcon({
    className: "map-job-marker-wrapper",
    html: `<div class="map-job-marker ${stateClass} ${selected ? "map-job-marker--selected" : ""}">${avatarHtml}<span class="map-job-time-pill">${job.timePill}</span></div>`,
    iconSize: [72, 46],
    iconAnchor: [24, 40],
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

export function TrackingMap({ current, jobs, staffLocations, routeLines, selectedJobId, recenterSignal, onJobSelect }: TrackingMapProps): React.JSX.Element {
  const center: [number, number] = [current.lat, current.lng];
  const tileUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${getMapboxToken()}`;
  const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>';

  const markers = useMemo(
    () =>
      staffLocations.map((location) => ({
        ...location,
        icon: avatarIcon(location),
      })),
    [staffLocations],
  );

  const mappableJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const latitude = job.coordinate?.lat;
        const longitude = job.coordinate?.lng;
        return Number.isFinite(latitude) && Number.isFinite(longitude);
      }),
    [jobs],
  );

  return (
    <div className="tracking-map-shell absolute left-0 top-0 z-0 h-screen w-screen overflow-hidden">
      <MapContainer center={center} zoom={14} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution={tileAttribution}
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

        {mappableJobs.map((job) => {
          const latitude = job.coordinate.lat;
          const longitude = job.coordinate.lng;
          return (
            <Marker
              key={job.id}
              position={[latitude, longitude]}
              icon={jobIcon(job, selectedJobId === job.id)}
              eventHandlers={{ click: () => onJobSelect(job.id) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>{job.clientName}</Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
