export type BridgeOrigin = 'sistema' | 'motorista';

export type BridgeSource = 'system' | 'driver' | 'community' | 'quick_add' | 'osm_overpass' | 'user';

export type ConfidenceStatus = 'nao_confirmada' | 'reportada_por_1_motorista' | 'confirmada_por_multiplos' | 'dados_em_conflito' | 'importada';

export interface Bridge {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  altura_maxima: number | null; // in meters, can be null for quick add
  notas: string;
  data_criacao: string; // ISO String
  origem: BridgeOrigin;
  confirmada: boolean;
  
  // New verification / sync fields
  photoDataUrl?: string; // Base64 data url for the attached picture
  reportsCount?: number; // How many drivers reported/confirmed this
  reportedHeights?: number[]; // Array of reported heights
  confidenceStatus?: ConfidenceStatus; // Verification status
  lastReportedAt?: string; // Timestamp of the latest report
  source?: BridgeSource; // System, Driver, Community, Quick Add, or OSM Overpass

  // Quick add / Imported standard fields
  status?: 'incomplete' | 'pending' | 'confirmed' | 'imported' | 'active';
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  height?: number | null;
  notes?: string;

  // OSM Overpass specific fields
  osmId?: string;
  maxHeightMeters?: number;
  city?: string;
}

export interface VehicleConfig {
  altura_veiculo: number; // in meters
  apelido_veiculo: string; // optional
  raio_alerta: 150 | 300 | 500 | 800; // in meters
  configurado: boolean;
  deposito_central: string; // name of selected central depot
  raio_captura_pontes: number; // in miles (50, 100, 150)
  altura_minima_ponte: number; // minimum bridge height in meters to filter/import
}

export interface AlertState {
  bridge: Bridge;
  distancia: number; // in meters
  vehicleHeight: number;
  timestamp: number;
  alertType: 'danger' | 'attention';
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}
