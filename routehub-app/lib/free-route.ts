export type RoutePoint = [number, number];

/**
 * Builds a driving route with the public OSRM/OpenStreetMap service.
 * No API key or paid map subscription is required. The caller can fall back
 * to a straight line when the public service is unavailable.
 */
export async function fetchFreeDrivingRoute(
  from: RoutePoint,
  to: RoutePoint
): Promise<RoutePoint[]> {
  const coordinates = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const endpoints = [
    `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) continue;

      const data = await response.json();
      const geometry = data?.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(geometry)) continue;

      const normalized = geometry
        .map((point: unknown): RoutePoint | null => {
          if (!Array.isArray(point) || point.length < 2) return null;
          const lon = Number(point[0]);
          const lat = Number(point[1]);
          return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
        })
        .filter((point): point is RoutePoint => point !== null);

      if (normalized.length >= 2) return normalized;
    } catch {
      // Try the backup public router before falling back to a straight line.
    }
  }

  throw new Error('Бесплатный сервис маршрутов временно недоступен');
}
