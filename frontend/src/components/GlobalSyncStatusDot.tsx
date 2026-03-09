"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type GpsStatus = "searching" | "ready" | "off";

type DotIndicator = {
  colorClass: string;
  label: string;
};

export function getDotRouteContext(pathname: string | null | undefined): {
  routePath: string;
  isMapRoute: boolean;
} {
  const routePath = pathname ?? "";
  return {
    routePath,
    isMapRoute: routePath === "/map" || routePath.startsWith("/tracking"),
  };
}

export function resolveDotIndicator(
  {
    isMapRoute,
    gpsStatus,
  }: {
    isMapRoute: boolean;
    gpsStatus: GpsStatus;
  }
): DotIndicator | null {
  if (isMapRoute) {
    if (gpsStatus === "ready") {
      return { colorClass: "bg-emerald-400", label: "GPS status: Location found" };
    }

    return { colorClass: "bg-amber-400", label: "GPS status: Searching or off" };
  }

  return null;
}

export function GlobalSyncStatusDot(): React.JSX.Element {
  const pathname = usePathname();
  const { isMapRoute } = getDotRouteContext(pathname);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("searching");

  useEffect(() => {
    if (!isMapRoute || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      () => setGpsStatus("ready"),
      () => setGpsStatus("off"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isMapRoute]);

  const indicator = useMemo(
    () => resolveDotIndicator({ isMapRoute, gpsStatus }),
    [gpsStatus, isMapRoute]
  );

  if (!indicator) {
    return <></>;
  }

  return (
    <div className="fixed right-4 top-4 z-[10000]" aria-label={indicator.label}>
      <span className={`block h-3 w-3 rounded-full ${indicator.colorClass}`} aria-hidden="true"></span>
    </div>
  );
}
