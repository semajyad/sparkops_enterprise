"use client";

import L, { DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Locate } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import { getTrackingTileConfig } from "@/lib/trackingMapConfig";

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
  const hasCenteredRef = useRef(false);
  const handledRecenterSignalRef = useRef(0);

  useEffect(() => {
    if (hasCenteredRef.current) {
      return;
    }
    map.setView([current.lat, current.lng], 14);
    hasCenteredRef.current = true;
  }, [map, current]);

  useEffect(() => {
    if (recenterSignal <= 0) {
      return;
    }

    if (handledRecenterSignalRef.current === recenterSignal) {
      return;
    }
    handledRecenterSignalRef.current = recenterSignal;

    map.flyTo([current.lat, current.lng], map.getZoom(), {
      animate: true,
      duration: 0.8,
    });
  }, [recenterSignal, current.lat, current.lng, map]);

  return null;
}

function avatarIcon(location: StaffLocation): DivIcon {
  const avatarHtml = location.avatarUrl
    ? `<div class="map-staff-avatar"><img src="${location.avatarUrl}" alt="${location.name}" /></div>`
    : `<div class="map-avatar-fallback">${location.initials}</div>`;

  return L.divIcon({
    className: `map-avatar-marker ${location.isStale ? "map-avatar-marker--stale" : ""}`,
    html: avatarHtml,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function jobIcon(job: MapJob, selected: boolean): DivIcon {
  const avatarHtml = job.avatarUrl
    ? `<img class="map-job-avatar h-full w-full rounded-full object-cover" src="${escapeAttribute(job.avatarUrl)}" alt="${escapeAttribute(job.clientName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="map-job-avatar-fallback hidden h-full w-full items-center justify-center rounded-full text-[11px] font-bold uppercase tracking-wider text-white">${job.initials}</div>`
    : `<div class="map-job-avatar-fallback flex h-full w-full items-center justify-center rounded-full text-[11px] font-bold uppercase tracking-wider text-white">${job.initials}</div>`;

  return L.divIcon({
    className: "map-avatar-marker",
    html: `
      <div class="relative w-10 h-10 rounded-full border-2 border-white shadow-lg bg-orange-600 flex items-center justify-center text-white font-bold ${selected ? 'scale-110 transition-transform' : ''}">
        ${avatarHtml}
        <div class="absolute -top-2 -right-4 bg-white text-gray-900 text-[10px] font-black px-2 py-0.5 rounded-full shadow border border-gray-200">
          ${job.timePill}
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function youIcon(): DivIcon {
  return L.divIcon({
    className: "tradeops-you-marker-wrapper",
    html: '<div class="tradeops-you-marker"><span class="tradeops-you-core"></span></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function LocateMeButton({ current }: { current: Coordinate }): React.JSX.Element {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={() => map.flyTo([current.lat, current.lng], 14, { animate: true, duration: 0.8 })}
      className="absolute bottom-24 right-4 z-[400] flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg border border-gray-200 transition hover:bg-gray-50 hover:text-orange-600 active:scale-95"
      aria-label="Locate me"
    >
      <Locate className="h-6 w-6" />
    </button>
  );
}

export function TrackingMap({ current, jobs, staffLocations, routeLines, selectedJobId, recenterSignal, onJobSelect }: TrackingMapProps): React.JSX.Element {
  const center: [number, number] = [current.lat, current.lng];
  const mapboxToken = getMapboxToken();
  const [useMapboxTiles, setUseMapboxTiles] = useState(Boolean(mapboxToken));

  useEffect(() => {
    setUseMapboxTiles(Boolean(mapboxToken));
  }, [mapboxToken]);

  const tileConfig = getTrackingTileConfig(mapboxToken, useMapboxTiles);

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
    <div className="tracking-map-shell relative z-0 h-full w-full overflow-hidden">
      <MapContainer 
        center={center} 
        zoom={14} 
        className="h-full w-full" 
        style={{ height: "100%", width: "100%" }} 
        scrollWheelZoom
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          eventHandlers={{
            tileerror: () => {
              if (useMapboxTiles) {
                setUseMapboxTiles(false);
              }
            },
          }}
        />
        <FollowCurrentLocation current={current} recenterSignal={recenterSignal} />
        <LocateMeButton current={current} />

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
