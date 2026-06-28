import { Bridge, ConfidenceStatus, BridgeSource } from '../types';
import { getDistance } from './geo';

export interface BridgeGroup {
  id: string; // ID of the representative bridge
  primaryBridge: Bridge;
  bridges: Bridge[];
  reportsCount: number;
  reportedHeights: number[];
  confidenceStatus: ConfidenceStatus;
  altura_maxima: number | null; // most repeated height, can be null
  isConflict: boolean;
  notesList: string[];
  photoDataUrl?: string; // photo from any bridge in the group
  source: BridgeSource;
}

/**
 * Groups a flat array of bridges by proximity (30 meters threshold)
 * and aggregates their reports, heights, and photos.
 */
export function getGroupedBridges(allBridges: Bridge[]): BridgeGroup[] {
  const groups: BridgeGroup[] = [];
  const visited = new Set<string>();

  for (const bridge of allBridges) {
    if (visited.has(bridge.id)) continue;

    // Start a new cluster with current bridge
    const cluster: Bridge[] = [bridge];
    visited.add(bridge.id);

    // Find all other unvisited bridges within 30 meters
    for (const other of allBridges) {
      if (visited.has(other.id)) continue;
      
      const dist = getDistance(bridge.latitude, bridge.longitude, other.latitude, other.longitude);
      if (dist <= 30) {
        cluster.push(other);
        visited.add(other.id);
      }
    }

    // Determine primary/representative bridge of this cluster
    // Give priority to 'sistema' (system) origin, then to those with a photo, then first in list
    let primaryBridge = cluster.find(b => b.origem === 'sistema');
    if (!primaryBridge) {
      primaryBridge = cluster.find(b => !!b.photoDataUrl) || cluster[0];
    }

    // Collect all reported heights
    const reportedHeights: number[] = [];
    cluster.forEach(b => {
      if (b.reportedHeights && b.reportedHeights.length > 0) {
        b.reportedHeights.forEach(h => {
          if (h !== null && h !== undefined) {
            reportedHeights.push(h);
          }
        });
      } else if (b.altura_maxima !== null && b.altura_maxima !== undefined) {
        reportedHeights.push(b.altura_maxima);
      }
    });

    // Find any photo in the cluster
    const photoDataUrl = cluster.find(b => !!b.photoDataUrl)?.photoDataUrl;

    // Calculate height frequencies to determine the "most likely" height (mode)
    const heightCounts: { [h: number]: number } = {};
    reportedHeights.forEach(h => {
      // Normalize to 2 decimal places to avoid float precision issues
      const rounded = Math.round(h * 100) / 100;
      heightCounts[rounded] = (heightCounts[rounded] || 0) + 1;
    });

    let mostFrequentHeight = primaryBridge.altura_maxima;
    let maxCount = 0;
    Object.entries(heightCounts).forEach(([hStr, count]) => {
      const h = parseFloat(hStr);
      if (count > maxCount) {
        maxCount = count;
        mostFrequentHeight = h;
      } else if (count === maxCount) {
        // If there's a tie, take the lower height as a safety measure for truck drivers
        if (mostFrequentHeight === null || h < mostFrequentHeight) {
          mostFrequentHeight = h;
        }
      }
    });

    // Check for conflict (disputa)
    const uniqueHeightsCount = Object.keys(heightCounts).length;
    const isConflict = uniqueHeightsCount > 1;

    // Calculate total reports
    const totalReports = cluster.reduce((sum, b) => sum + (b.reportsCount || 1), 0);

    // Determine confidence status
    let confidenceStatus: ConfidenceStatus = 'nao_confirmada';
    if (isConflict) {
      confidenceStatus = 'dados_em_conflito';
    } else if (primaryBridge.origem === 'sistema') {
      confidenceStatus = 'confirmada_por_multiplos';
    } else if (totalReports >= 2) {
      confidenceStatus = 'confirmada_por_multiplos';
    } else if (totalReports === 1) {
      confidenceStatus = 'reportada_por_1_motorista';
    }

    // Concatenate non-empty unique notes
    const notesList: string[] = [];
    cluster.forEach(b => {
      if (b.notas && b.notas.trim()) {
        const trimmed = b.notas.trim();
        if (!notesList.includes(trimmed)) {
          notesList.push(trimmed);
        }
      }
    });

    // Determine final source
    let source: BridgeSource = 'driver';
    if (cluster.some(b => b.source === 'system' || b.origem === 'sistema')) {
      source = 'system';
    } else if (cluster.some(b => b.source === 'osm_overpass')) {
      source = 'osm_overpass';
    } else if (cluster.length >= 2 || totalReports >= 2) {
      source = 'community';
    }

    groups.push({
      id: primaryBridge.id,
      primaryBridge,
      bridges: cluster,
      reportsCount: totalReports,
      reportedHeights,
      confidenceStatus,
      altura_maxima: mostFrequentHeight,
      isConflict,
      notesList,
      photoDataUrl,
      source,
    });
  }

  return groups;
}

/**
 * Returns human-readable label for confidence statuses
 */
export function getConfidenceStatusLabel(status: ConfidenceStatus): string {
  switch (status) {
    case 'nao_confirmada':
      return 'Não verificada';
    case 'reportada_por_1_motorista':
      return 'Reportada por 1 motorista';
    case 'confirmada_por_multiplos':
      return 'Confirmada por múltiplos motoristas';
    case 'dados_em_conflito':
      return 'Dados em conflito';
    case 'importada':
      return 'Importada do OSM';
    default:
      return 'Desconhecido';
  }
}
