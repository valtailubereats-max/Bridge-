export interface Depot {
  name: string;
  latitude: number;
  longitude: number;
}

export const DEPOTS: Depot[] = [
  { name: 'Southampton', latitude: 50.9097, longitude: -1.4044 },
  { name: 'Exeter', latitude: 50.7184, longitude: -3.5339 },
  { name: 'Swindon', latitude: 51.5558, longitude: -1.7797 },
  { name: 'Reading', latitude: 51.4543, longitude: -0.9781 }
];

export function getDepotCoords(name: string): { latitude: number; longitude: number } {
  const depot = DEPOTS.find(d => d.name.toLowerCase() === name.toLowerCase());
  if (depot) {
    return { latitude: depot.latitude, longitude: depot.longitude };
  }
  return { latitude: 50.9097, longitude: -1.4044 }; // default to Southampton
}

/**
 * Calcula a distância entre duas coordenadas geográficas em metros usando a fórmula Haversine.
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
      
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distância em metros
}

/**
 * Formata a distância de forma legível para o motorista (ex: 350m, 1.2km)
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(2).replace('.', ',')}km`;
}

/**
 * Retorna o link para abrir a localização ou rota no Google Maps
 */
export function getGoogleMapsUrl(latitude: number, longitude: number, label?: string): string {
  // Retorna um link de busca/navegação direta que funciona em Android, iOS e web
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/**
 * Retorna um link de direções/navegação para a ponte baixa
 */
export function getGoogleMapsDirectionUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
}

/**
 * Gera coordenadas fictícias próximas a um ponto para simulação de aproximação (ex: a 200m de distância)
 */
export function getSimulatedCoordinates(bridgeLat: number, bridgeLon: number, distanceInMeters: number = 200): { latitude: number, longitude: number } {
  // 1 grau de latitude é aprox. 111,000 metros.
  // 1 grau de longitude é aprox. 111,000 * cos(lat) metros.
  // Vamos simular ao sul/oeste do ponto de forma simples.
  const latOffset = distanceInMeters / 111000;
  const lonOffset = distanceInMeters / (111000 * Math.cos((bridgeLat * Math.PI) / 180));
  
  return {
    latitude: bridgeLat - latOffset * 0.707, // aprox. direção sudoeste
    longitude: bridgeLon - lonOffset * 0.707
  };
}
