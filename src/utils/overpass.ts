import { Bridge } from '../types';
import { getDistance } from './geo';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

/**
 * Parses maxheight string to meters.
 * Handles meters (e.g., "3.5", "3.5m", "3.5 meters") and imperial (e.g., "12'6\"", "12' 6\"", "12'").
 */
export function parseMaxHeight(maxHeightStr: string): number | null {
  if (!maxHeightStr) return null;
  
  let str = maxHeightStr.trim().toLowerCase();
  
  // Remove trailing "m", "meters", "metres", " meters"
  str = str.replace(/(meters|metres|m)$/, '').trim();
  
  // Check for feet and inches format: e.g. 13'6" or 13' 6" or 13' or 13’6”
  if (str.includes("'") || str.includes("’") || str.includes("`")) {
    const feetParts = str.split(/['’`]/);
    const feet = parseFloat(feetParts[0]);
    let inches = 0;
    if (feetParts[1]) {
      const inchStr = feetParts[1].replace(/["”]/g, '').trim();
      if (inchStr) {
        inches = parseFloat(inchStr);
      }
    }
    if (!isNaN(feet)) {
      return (feet * 0.3048) + (inches * 0.0254);
    }
  }
  
  const parsed = parseFloat(str);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Fetches bridges within a specified radius around a coordinate from Overpass API.
 * Uses fallback mirrors and retries for maximum reliability.
 */
async function fetchBridgesByCoordinates(lat: number, lon: number, radiusMeters: number): Promise<any[]> {
  const query = `
    [out:json][timeout:60];
    (
      node["maxheight"](around:${Math.round(radiusMeters)},${lat},${lon});
      way["maxheight"](around:${Math.round(radiusMeters)},${lat},${lon});
    );
    out center;
  `;

  let lastError: Error | null = null;

  for (const url of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(`${url}?data=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          return data.elements || [];
        } else {
          lastError = new Error(`Overpass API returned status ${response.status} from ${url}`);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      // Delay before next attempt or next endpoint
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error("Failed to fetch from all Overpass API endpoints");
}

/**
 * Performs sequential import of low bridges (height <= 4.0m) within a radius around coordinates.
 * Avoids duplicates using osmId and proximity checks.
 */
export async function importBridgesFromOSM(
  existingBridges: Bridge[],
  lat: number,
  lon: number,
  radiusMiles: number,
  onProgress: (statusText: string) => void,
  minHeight?: number
): Promise<{ importedBridges: Bridge[]; skippedCount: number; errorCount: number }> {
  const newBridges: Bridge[] = [];
  let skippedCount = 0;
  let errorCount = 0;

  // Build lookup sets for existing bridges to easily avoid duplicates
  const existingOsmIds = new Set<string>();
  existingBridges.forEach((b) => {
    if (b.osmId) {
      existingOsmIds.add(b.osmId);
    }
  });

  const radiusMeters = radiusMiles * 1609.34;
  onProgress(`A procurar pontes baixas num raio de ${radiusMiles} milhas (${(radiusMeters / 1000).toFixed(0)} km)...`);

  try {
    const elements = await fetchBridgesByCoordinates(lat, lon, radiusMeters);
    let bridgeCount = 0;

    for (const el of elements) {
      const osmId = el.id.toString();
      
      // 1. Check duplicate by OSM ID
      if (existingOsmIds.has(osmId)) {
        skippedCount++;
        continue;
      }

      const tags = el.tags || {};
      const maxheightStr = tags.maxheight;
      if (!maxheightStr) continue;

      const parsedHeight = parseMaxHeight(maxheightStr);
      // We only care about low bridges with height <= 4.0 meters
      if (parsedHeight === null || parsedHeight > 4.0) continue;

      // Skip bridges below minimum height if specified
      if (minHeight !== undefined && minHeight > 0 && parsedHeight < minHeight) {
        skippedCount++;
        continue;
      }

      // Extract coordinates
      const bridgeLat = el.lat !== undefined ? el.lat : (el.center ? el.center.lat : null);
      const bridgeLon = el.lon !== undefined ? el.lon : (el.center ? el.center.lon : null);
      if (bridgeLat === null || bridgeLon === null) continue;

      // 2. Check duplicate by proximity & height (within 20m of existing with same height)
      const isNearDuplicate = existingBridges.some((eb) => {
        const dist = getDistance(bridgeLat, bridgeLon, eb.latitude, eb.longitude);
        // If within 20m and height is very close (within 5cm)
        return dist <= 20 && eb.altura_maxima !== null && Math.abs(eb.altura_maxima - parsedHeight) < 0.05;
      });

      if (isNearDuplicate) {
        skippedCount++;
        continue;
      }

      const osmName = tags.name || tags.bridge_name || `Ponte Baixa (${parsedHeight.toFixed(1)}m)`;
      const formattedNotes = `Importada do OpenStreetMap. OSM ID: ${osmId}. Região: Proximidade GPS (Raio ${radiusMiles}mi). maxheight original: ${maxheightStr}`;

      const newBridge: Bridge = {
        id: `osm-${osmId}`,
        nome: osmName,
        latitude: bridgeLat,
        longitude: bridgeLon,
        altura_maxima: parsedHeight,
        notas: formattedNotes,
        data_criacao: new Date().toISOString(),
        origem: 'sistema',
        confirmada: false, // marked as not confirmed by user yet, needs confirmation
        source: 'osm_overpass',
        status: 'imported',
        title: 'Ponte baixa',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        osmId: osmId,
        maxHeightMeters: parsedHeight,
        city: 'GPS Proximidade',
      };

      newBridges.push(newBridge);
      bridgeCount++;
    }
    onProgress(`Encontradas e preparadas ${bridgeCount} novas pontes nesta área.`);
  } catch (err) {
    console.error(`Error importing bridges around GPS coordinates:`, err);
    errorCount++;
    onProgress(`Falha ao obter dados do Overpass API para esta área.`);
  }

  return {
    importedBridges: newBridges,
    skippedCount,
    errorCount,
  };
}
