import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Bridge, Coordinates, ConfidenceStatus } from '../types';
import { getDistance, formatDistance, getGoogleMapsDirectionUrl } from '../utils/geo';
import { getGroupedBridges, getConfidenceStatusLabel } from '../utils/bridgeGroup';
import { Navigation, Compass, Map, Filter, ZoomIn, CheckCircle2, Plus, X, Radio, Camera, Image as ImageIcon } from 'lucide-react';

interface InteractiveMapProps {
  bridges: Bridge[];
  currentLocation: Coordinates | null;
  vehicleHeight: number;
  alertRadius: number;
  gpsActive: boolean;
  filter: 'all' | 'restricted' | 'nearby';
  setFilter: (filter: 'all' | 'restricted' | 'nearby') => void;
  onQuickAdd?: (latitude: number, longitude: number) => void;
  onOpenFormWithCoords?: (lat: number, lng: number) => void;
  onEdit?: (bridge: Bridge) => void;
  onDelete?: (id: string) => void;
  temporaryBridgeCoords?: Coordinates | null;
  onChangeTemporaryCoords?: (coords: Coordinates | null) => void;
  activeTheme?: 'light' | 'dark';
  isAddBridgeButtonEnabled?: boolean;
  onStartMonitoring?: () => void;
  onStopMonitoring?: () => void;
  isCapturingMode?: boolean;
  captureCountdown?: number | null;
  capturedPhotoUrl?: string;
  hasDraggedPino?: boolean;
  onConfirmLocation?: () => void;
  onCancelCapture?: () => void;
  onUseCurrentLocation?: () => void;
  onTriggerCamera?: () => void;
  onStartCaptureMode?: () => void;
}

export default function InteractiveMap({
  bridges,
  currentLocation,
  vehicleHeight,
  alertRadius,
  gpsActive,
  filter,
  setFilter,
  onQuickAdd,
  onOpenFormWithCoords,
  onEdit,
  onDelete,
  temporaryBridgeCoords,
  onChangeTemporaryCoords,
  activeTheme = 'dark',
  isAddBridgeButtonEnabled = false,
  onStartMonitoring,
  onStopMonitoring,
  isCapturingMode = false,
  captureCountdown = null,
  capturedPhotoUrl = '',
  hasDraggedPino = false,
  onConfirmLocation,
  onCancelCapture,
  onUseCurrentLocation,
  onTriggerCamera,
  onStartCaptureMode,
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const bridgeMarkersRef = useRef<{ [id: string]: { marker: L.Marker; circle?: L.Circle } }>({});
  const hasCenteredFirstTimeRef = useRef<boolean>(false);
  
  const [isFollowing, setIsFollowing] = useState<boolean>(() => {
    const saved = localStorage.getItem('low_bridge_is_following');
    if (saved !== null) {
      return saved === 'true';
    }
    return gpsActive;
  });
  const [selectedPoint, setSelectedPoint] = useState<Coordinates | null>(null);
  const [zoom, setZoom] = useState<number>(13);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState<boolean>(false);
  const selectedMarkerRef = useRef<L.Marker | null>(null);
  const tempMarkerRef = useRef<L.Marker | null>(null);

  const isFollowingRef = useRef(isFollowing);
  useEffect(() => {
    isFollowingRef.current = isFollowing;
    localStorage.setItem('low_bridge_is_following', String(isFollowing));
  }, [isFollowing]);

  const currentLocationRef = useRef(currentLocation);
  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  const bridgesRef = useRef(bridges);
  useEffect(() => {
    bridgesRef.current = bridges;
  }, [bridges]);

  const onEditRef = useRef(onEdit);
  useEffect(() => {
    onEditRef.current = onEdit;
  }, [onEdit]);

  const onDeleteRef = useRef(onDelete);
  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  const onChangeTemporaryCoordsRef = useRef(onChangeTemporaryCoords);
  useEffect(() => {
    onChangeTemporaryCoordsRef.current = onChangeTemporaryCoords;
  }, [onChangeTemporaryCoords]);

  const onMapClickRef = useRef<(e: L.LeafletMouseEvent) => void>(() => {});
  onMapClickRef.current = (e: L.LeafletMouseEvent) => {
    // Completely disable selecting point via direct map clicks to prevent accidental bridge creation
  };

  const handleQuickAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (temporaryBridgeCoords) return;

    if (onStartCaptureMode) {
      onStartCaptureMode();
      return;
    }

    let lat: number | null = null;
    let lng: number | null = null;

    if (currentLocation) {
      lat = currentLocation.latitude;
      lng = currentLocation.longitude;
    } else {
      // Fallback: use map center if available
      const map = mapRef.current;
      if (map) {
        const center = map.getCenter();
        lat = center.lat;
        lng = center.lng;
      }
    }

    if (lat !== null && lng !== null) {
      if (onChangeTemporaryCoords) {
        onChangeTemporaryCoords({ latitude: lat, longitude: lng });
      }
    }
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPoint(null);
  };

  // Default coordinate center: Portsmouth, UK
  const defaultCenter: [number, number] = [50.803600, -1.075600];
  const defaultZoom = 13;

  // Track GPS Activation to automatically turn on "Follow me"
  useEffect(() => {
    if (gpsActive) {
      setIsFollowing(true);
    } else {
      setIsFollowing(false);
      hasCenteredFirstTimeRef.current = false;
    }
  }, [gpsActive]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create Leaflet map instance
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(
      currentLocation ? [currentLocation.latitude, currentLocation.longitude] : defaultCenter,
      defaultZoom
    );

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Detect when user manually drags the map to temporarily pause follow mode
    map.on('dragstart', () => {
      setIsFollowing(false);
    });

    // Detect click to select custom point
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current(e);
    });

    // Detect zoom changes to update the state
    setZoom(map.getZoom());
    map.on('zoomend', () => {
      setZoom(map.getZoom());
    });

    // Use robust event delegation on the map container to handle click events on popup buttons.
    // This is completely immune to Leaflet dynamically recreating or replacing the popup HTML.
    const handleMapContainerClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;

      const deleteBtn = target.closest('.popup-delete-btn');
      if (deleteBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const bridgeIds = deleteBtn.getAttribute('data-bridge-ids');
        if (bridgeIds && onDeleteRef.current) {
          if (confirm('Tem a certeza que deseja excluir esta ponte?')) {
            onDeleteRef.current(bridgeIds);
            map.closePopup();
          }
        }
        return;
      }

      const editBtn = target.closest('.popup-edit-btn');
      if (editBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const bridgeId = editBtn.getAttribute('data-bridge-id');
        if (bridgeId && onEditRef.current) {
          const targetBridge = bridgesRef.current.find(b => b.id === bridgeId);
          if (targetBridge) {
            onEditRef.current(targetBridge);
            map.closePopup();
          }
        }
        return;
      }
    };

    const container = map.getContainer();
    container.addEventListener('click', handleMapContainerClick);

    // Detect popup open/close to invalidate layout size for newly sized frames
    map.on('popupopen', () => {
      setTimeout(() => {
        map.invalidateSize();
      }, 350);
    });

    map.on('popupclose', () => {
      setTimeout(() => {
        map.invalidateSize();
      }, 350);
    });

    mapRef.current = map;

    // Set up ResizeObserver to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    // Handle window focus/visibility changes to redraw the map layout and re-center if following
    const handleMapVisibilityChange = (e: Event) => {
      if (e.type === 'visibilitychange' && document.visibilityState === 'hidden') {
        return;
      }
      if (mapRef.current) {
        console.log('[Map] Container visible or focused, refreshing layout and centering...');
        mapRef.current.invalidateSize();
        // If we are currently following and have a location, ensure we re-center
        // This solves the black screen / lock screen losing center issue!
        if (isFollowingRef.current && currentLocationRef.current) {
          const latLng: L.LatLngExpression = [currentLocationRef.current.latitude, currentLocationRef.current.longitude];
          mapRef.current.setView(latLng, mapRef.current.getZoom(), { animate: true });
        }
      }
    };

    document.addEventListener('visibilitychange', handleMapVisibilityChange);
    window.addEventListener('focus', handleMapVisibilityChange);

    return () => {
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleMapVisibilityChange);
      window.removeEventListener('focus', handleMapVisibilityChange);
      if (mapRef.current) {
        try {
          const container = mapRef.current.getContainer();
          if (container) {
            container.removeEventListener('click', handleMapContainerClick);
          }
        } catch (e) {
          console.warn('Failed to clean up container click listener', e);
        }
        mapRef.current.off('dragstart');
        mapRef.current.off('click');
        mapRef.current.off('popupopen');
        mapRef.current.off('zoomend');
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 6. Mostrar no mapa apenas pontes com altura igual ou inferior a 4 metros ou nulas (cadastro rápido / pendentes)
  const mapBridges = React.useMemo(() => {
    return bridges.filter(b => b.altura_maxima === null || b.altura_maxima <= 4);
  }, [bridges]);

  // Calculate grouped bridges for clustering nearby records (within 30m)
  const groupedBridges = React.useMemo(() => {
    return getGroupedBridges(mapBridges);
  }, [mapBridges]);

  // Filter groups according to user selection
  const filteredGroups = React.useMemo(() => {
    return groupedBridges.filter((group) => {
      if (filter === 'restricted') {
        return group.altura_maxima === null || group.altura_maxima <= vehicleHeight;
      }
      if (filter === 'nearby') {
        const refLat = currentLocation ? currentLocation.latitude : defaultCenter[0];
        const refLng = currentLocation ? currentLocation.longitude : defaultCenter[1];
        const dist = getDistance(refLat, refLng, group.primaryBridge.latitude, group.primaryBridge.longitude);
        return dist <= alertRadius; // Use the defined alert/proximity radius
      }
      return true;
    });
  }, [groupedBridges, filter, vehicleHeight, currentLocation, alertRadius]);

  // 7. Clustering to avoid visual pollution on distant zoom levels
  const clusteredItems = React.useMemo(() => {
    if (zoom >= 14) {
      return filteredGroups.map(group => ({
        id: group.id,
        latitude: group.primaryBridge.latitude,
        longitude: group.primaryBridge.longitude,
        group,
        isCluster: false as const,
      }));
    }

    // Zoom-dependent threshold (approx degrees)
    const threshold = 0.006 * Math.pow(1.8, 14 - zoom);

    const items: Array<{
      id: string;
      latitude: number;
      longitude: number;
      group?: any;
      groups?: any[];
      isCluster: boolean;
    }> = [];

    filteredGroups.forEach((group) => {
      let merged = false;
      for (const item of items) {
        if (item.isCluster) {
          const distLat = Math.abs(item.latitude - group.primaryBridge.latitude);
          const distLng = Math.abs(item.longitude - group.primaryBridge.longitude);
          if (distLat < threshold && distLng < threshold) {
            item.groups!.push(group);
            item.latitude = item.groups!.reduce((sum, g) => sum + g.primaryBridge.latitude, 0) / item.groups!.length;
            item.longitude = item.groups!.reduce((sum, g) => sum + g.primaryBridge.longitude, 0) / item.groups!.length;
            merged = true;
            break;
          }
        }
      }

      if (!merged) {
        items.push({
          id: `cluster-${group.id}`,
          latitude: group.primaryBridge.latitude,
          longitude: group.primaryBridge.longitude,
          group,
          groups: [group],
          isCluster: true,
        });
      }
    });

    return items.map((item) => {
      if (item.isCluster && item.groups && item.groups.length === 1) {
        const singleGroup = item.groups[0];
        return {
          id: singleGroup.id,
          latitude: singleGroup.primaryBridge.latitude,
          longitude: singleGroup.primaryBridge.longitude,
          group: singleGroup,
          isCluster: false as const,
        };
      }
      return item;
    });
  }, [filteredGroups, zoom]);

  // Fit bounds to show all currently filtered bridges
  const handleFitBounds = () => {
    const map = mapRef.current;
    if (!map || filteredGroups.length === 0) return;

    try {
      const points = filteredGroups.map((g) => L.latLng(g.primaryBridge.latitude, g.primaryBridge.longitude));
      
      // If GPS is active and user has a current location, include that in bounds as well
      if (currentLocation) {
        points.push(L.latLng(currentLocation.latitude, currentLocation.longitude));
      }

      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds.pad(0.2), { animate: true, duration: 1.2, maxZoom: 16 });
    } catch (e) {
      console.error('Error fitting map bounds:', e);
    }
  };

  // Auto-fit bounds when filter changes to help the user see all matching bridges
  useEffect(() => {
    const map = mapRef.current;
    if (map && filteredGroups.length > 0) {
      const timer = setTimeout(() => {
        handleFitBounds();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [filter]);

  // Update User Marker and Map Center based on Following State
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (currentLocation) {
      const userLatLng: L.LatLngExpression = [currentLocation.latitude, currentLocation.longitude];

      // Create or update user marker
      if (!userMarkerRef.current) {
        // Custom pulsing blue dot for the driver's location
        const userIcon = L.divIcon({
          className: 'custom-user-icon',
          html: `
            <div class="relative flex items-center justify-center w-6 h-6">
              <span class="absolute inline-flex w-full h-full rounded-full bg-blue-500 opacity-60 animate-ping"></span>
              <span class="relative inline-flex rounded-full h-4.5 w-4.5 bg-blue-600 border-2 border-white shadow-md"></span>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        userMarkerRef.current = L.marker(userLatLng, { icon: userIcon }).addTo(map);
        userMarkerRef.current.bindPopup('<b class="text-xs">A sua Posição Atual (Motorista)</b>');
      } else {
        userMarkerRef.current.setLatLng(userLatLng);
      }

      // Handle Map centering logic
      if (isFollowing) {
        if (!hasCenteredFirstTimeRef.current) {
          // Center and zoom correctly on first positioning
          map.setView(userLatLng, 15);
          hasCenteredFirstTimeRef.current = true;
        } else {
          // Smoothly pan to keep user centered without changing user's manual zoom level
          map.panTo(userLatLng, { animate: true, duration: 1.0 });
        }
      }
    } else {
      // If GPS inactive, remove user marker
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
    }
  }, [currentLocation, isFollowing, gpsActive]);

  // Update Selected Point Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedPoint) {
      const latLng: L.LatLngExpression = [selectedPoint.latitude, selectedPoint.longitude];

      if (!selectedMarkerRef.current) {
        // Custom orange pinpoint icon (only a pin, no popup to avoid blocking the view)
        const selectedIcon = L.divIcon({
          className: 'custom-selected-marker',
          html: `
            <div class="relative flex items-center justify-center w-8 h-8 animate-bounce">
              <svg class="w-6 h-6 text-amber-500 filter drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        const marker = L.marker(latLng, { icon: selectedIcon, draggable: true }).addTo(map);
        
        marker.on('dragend', (event: any) => {
          const m = event.target;
          const position = m.getLatLng();
          setSelectedPoint({ latitude: position.lat, longitude: position.lng });
        });

        selectedMarkerRef.current = marker;
      } else {
        const existingMarker = selectedMarkerRef.current;
        const currentLatLng = existingMarker.getLatLng();
        if (currentLatLng.lat !== selectedPoint.latitude || currentLatLng.lng !== selectedPoint.longitude) {
          existingMarker.setLatLng(latLng);
        }
      }
    } else {
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.remove();
        selectedMarkerRef.current = null;
      }
    }
  }, [selectedPoint]);

  // Update Temporary Bridge Marker (Quick Add Mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (temporaryBridgeCoords) {
      const latLng: L.LatLngExpression = [temporaryBridgeCoords.latitude, temporaryBridgeCoords.longitude];

      if (!tempMarkerRef.current) {
        // Pan map to center on the temporary bridge location on initial load so user sees where it is
        map.setView(latLng, Math.max(map.getZoom(), 16), { animate: true, duration: 1.0 });

        // Custom temporary pinpoint icon (only a pin, no large text blocks to avoid blocking the view)
        const tempIcon = L.divIcon({
          className: 'custom-temp-marker',
          html: `
            <div class="relative flex items-center justify-center w-8 h-8 animate-bounce">
              <svg class="w-6 h-6 text-amber-500 filter drop-shadow-md animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              <!-- Subtle pulsing circle around the pin -->
              <span class="absolute h-8 w-8 rounded-full border-2 border-amber-500 animate-ping opacity-60"></span>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        const marker = L.marker(latLng, { icon: tempIcon, draggable: true }).addTo(map);

        marker.on('dragend', (event: any) => {
          const m = event.target;
          const position = m.getLatLng();
          if (onChangeTemporaryCoordsRef.current) {
            onChangeTemporaryCoordsRef.current({ latitude: position.lat, longitude: position.lng });
          }
        });

        tempMarkerRef.current = marker;
      } else {
        const existingMarker = tempMarkerRef.current;
        const currentLatLng = existingMarker.getLatLng();
        if (currentLatLng.lat !== temporaryBridgeCoords.latitude || currentLatLng.lng !== temporaryBridgeCoords.longitude) {
          existingMarker.setLatLng(latLng);
        }
      }
    } else {
      if (tempMarkerRef.current) {
        tempMarkerRef.current.remove();
        tempMarkerRef.current = null;
      }
    }
  }, [temporaryBridgeCoords]);

  // Update Bridge Markers and Alert Circles with Clustering Support
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. Remove markers of items that are no longer in the clustered set
    const currentItemIds = new Set(clusteredItems.map((item) => item.id));
    Object.keys(bridgeMarkersRef.current).forEach((id) => {
      if (!currentItemIds.has(id)) {
        const { marker, circle } = bridgeMarkersRef.current[id];
        marker.remove();
        if (circle) circle.remove();
        delete bridgeMarkersRef.current[id];
      }
    });

    // 2. Create or update markers for all clustered items (clusters or individual bridges)
    clusteredItems.forEach((item) => {
      if (item.isCluster) {
        // Render cluster marker
        const clusterLatLng: L.LatLngExpression = [item.latitude, item.longitude];
        const totalBridgesCount = item.groups ? item.groups.reduce((acc, g) => acc + (g.bridges?.length || 1), 0) : 0;

        const clusterHtml = `
          <div class="relative flex items-center justify-center w-10 h-10 bg-slate-900 border-2 border-emerald-500 text-emerald-400 font-extrabold rounded-full shadow-lg cursor-pointer transform hover:scale-105 transition-all">
            <span class="text-xs font-black">${totalBridgesCount}</span>
            <span class="absolute inset-0 rounded-full border border-emerald-500 animate-ping opacity-20"></span>
          </div>
        `;

        const clusterIcon = L.divIcon({
          className: 'custom-cluster-marker',
          html: clusterHtml,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        if (!bridgeMarkersRef.current[item.id]) {
          const marker = L.marker(clusterLatLng, { icon: clusterIcon }).addTo(map);
          marker.on('click', () => {
            map.setView(clusterLatLng, Math.min(map.getZoom() + 2, 18), { animate: true });
          });
          bridgeMarkersRef.current[item.id] = { marker };
        } else {
          const existing = bridgeMarkersRef.current[item.id];
          existing.marker.setLatLng(clusterLatLng);
          existing.marker.setIcon(clusterIcon);
          
          existing.marker.off('click');
          existing.marker.on('click', () => {
            map.setView(clusterLatLng, Math.min(map.getZoom() + 2, 18), { animate: true });
          });

          if (existing.circle) {
            existing.circle.remove();
            existing.circle = undefined;
          }
        }
      } else {
        // Render individual bridge marker
        const group = item.group!;
        const bridge = group.primaryBridge;
        const isDanger = group.altura_maxima !== null && group.altura_maxima <= vehicleHeight;
        const bridgeLatLng: L.LatLngExpression = [bridge.latitude, bridge.longitude];
        
        // Calculate real distance if location is available
        const distance = currentLocation
          ? getDistance(currentLocation.latitude, currentLocation.longitude, bridge.latitude, bridge.longitude)
          : null;

        const distanceStr = distance !== null ? formatDistance(distance) : 'Desconhecida';

        // Status translation
        const statusLabel = getConfidenceStatusLabel(group.confidenceStatus);
        
        // Status color matching
        let statusColor = '#94a3b8'; // gray
        if (group.confidenceStatus === 'dados_em_conflito') {
          statusColor = '#f87171'; // red
        } else if (group.confidenceStatus === 'confirmada_por_multiplos') {
          statusColor = '#34d399'; // green
        } else if (group.confidenceStatus === 'reportada_por_1_motorista') {
          statusColor = '#60a5fa'; // blue
        }

        // Define custom HTML for height badge based on danger level and conflict status
        const borderClass = group.isConflict 
          ? 'border-dashed border-red-500 animate-pulse' 
          : (isDanger 
              ? 'border-red-500' 
              : (group.altura_maxima === null ? 'border-amber-600' : 'border-emerald-500'));
        const badgeBg = isDanger 
          ? 'bg-red-600' 
          : (group.altura_maxima === null ? 'bg-amber-500' : 'bg-emerald-600');

        const heightDisplay = group.altura_maxima !== null ? `${group.altura_maxima.toFixed(1)}m` : 'Incompleta';
        const arrowBgColorClass = isDanger 
          ? 'red-600' 
          : (group.altura_maxima === null ? 'amber-500' : 'emerald-600');

        const markerHtml = `
          <div class="flex flex-col items-center select-none cursor-pointer">
            <div class="relative flex items-center justify-center ${badgeBg} text-white font-extrabold text-[10px] px-2 py-1 rounded-lg shadow-lg border-2 ${borderClass} whitespace-nowrap">
              <span>${group.isConflict ? '⚠️ ' : (isDanger ? '🛑 ' : (group.altura_maxima === null ? '⚠️ ' : '✅ '))}${heightDisplay}</span>
              <div class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-${arrowBgColorClass}"></div>
            </div>
          </div>
        `;

        const bridgeIcon = L.divIcon({
          className: 'custom-bridge-marker',
          html: markerHtml,
          iconSize: [60, 30],
          iconAnchor: [30, 30],
        });

        // Photo thumbnail layout
        const photoHtml = group.photoDataUrl
          ? `
            <div class="mb-2 rounded-lg overflow-hidden border border-slate-700 h-20 w-full bg-slate-950 flex items-center justify-center shrink-0">
              <img src="${group.photoDataUrl}" alt="Foto da ponte" class="w-full h-full object-cover" />
            </div>
          `
          : '';

        // Conflict message
        const conflictWarningHtml = group.isConflict
          ? `
            <div class="bg-red-950/60 border border-red-800/80 rounded-lg p-1.5 mb-2 text-[10px] text-red-200 font-medium leading-normal">
              ⚠️ <b>Altura em disputa:</b> alguns motoristas informaram valores diferentes para esta ponte.
            </div>
          `
          : '';

        const mapsUrl = getGoogleMapsDirectionUrl(bridge.latitude, bridge.longitude);
        const popupHtml = `
          <div class="p-1 font-sans space-y-2 text-slate-100 bg-slate-900 rounded-lg max-w-[220px]" style="color: #f1f5f9; min-width: 180px;">
            ${photoHtml}
            
            <div>
              <h4 class="font-bold text-sm text-white leading-tight">${bridge.nome}</h4>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="h-2 w-2 rounded-full inline-block" style="background-color: ${statusColor};"></span>
                <span class="text-[9px] text-slate-300 font-bold uppercase tracking-wider">${statusLabel}</span>
              </div>
            </div>

            ${conflictWarningHtml}
            
            <div class="grid grid-cols-2 gap-1.5 py-1 text-xs border-t border-slate-800">
              <div>
                <span class="text-[9px] text-slate-400 uppercase font-bold block">Consensual</span>
                <span class="font-extrabold ${isDanger ? 'text-red-400' : (group.altura_maxima === null ? 'text-amber-400' : 'text-emerald-400')}">${group.altura_maxima !== null ? group.altura_maxima.toFixed(2) + 'm' : 'Incompleta'}</span>
              </div>
              <div>
                <span class="text-[9px] text-slate-400 uppercase font-bold block">Relatórios</span>
                <span class="font-bold text-slate-300 font-mono">${group.reportsCount} relato(s)</span>
              </div>
            </div>

            <div class="text-[9px] text-slate-400 pb-1 flex justify-between">
              <span>Distância: <b>${distanceStr}</b></span>
            </div>

            <div class="pt-1 space-y-1">
              <a href="${mapsUrl}" target="_blank" rel="noreferrer" 
                 class="inline-flex items-center justify-center gap-1 w-full py-1.5 px-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-[10px] no-underline transition-all cursor-pointer">
                 <span>Rota no Google Maps</span>
              </a>
              ${onEdit ? `
                <button class="popup-edit-btn inline-flex items-center justify-center gap-1 w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-lg font-bold text-[10px] border border-slate-700 transition-all cursor-pointer" data-bridge-id="${bridge.id}">
                  <span>Editar Ponte</span>
                </button>
              ` : ''}
              ${onDelete ? `
                <button class="popup-delete-btn inline-flex items-center justify-center gap-1 w-full py-1.5 px-2 bg-red-950/45 hover:bg-red-900/50 border border-red-500/20 text-red-400 hover:text-red-300 rounded-lg font-bold text-[10px] transition-all cursor-pointer" data-bridge-ids="${group.bridges.map((b) => b.id).join(',')}">
                  <span>Excluir Ponte</span>
                </button>
              ` : ''}
            </div>
          </div>
        `;

        if (!bridgeMarkersRef.current[item.id]) {
          // Create new marker
          const marker = L.marker(bridgeLatLng, { icon: bridgeIcon }).addTo(map);
          marker.bindPopup(popupHtml, { className: 'custom-leaflet-popup' });

          // Create alert circle matching the configured radius if it is a dangerous bridge
          let circle: L.Circle | undefined = undefined;
          if (isDanger) {
            circle = L.circle(bridgeLatLng, {
              radius: alertRadius,
              color: '#ef4444',
              fillColor: '#ef4444',
              fillOpacity: 0.12,
              weight: 1.5,
              dashArray: '4, 4',
            }).addTo(map);
          }

          bridgeMarkersRef.current[item.id] = { marker, circle };
        } else {
          // Update existing marker
          const existing = bridgeMarkersRef.current[item.id];
          existing.marker.setLatLng(bridgeLatLng);
          existing.marker.setIcon(bridgeIcon);
          existing.marker.setPopupContent(popupHtml);

          // Update circle radius or add if missing
          if (isDanger) {
            if (existing.circle) {
              existing.circle.setLatLng(bridgeLatLng);
              existing.circle.setRadius(alertRadius);
            } else {
              existing.circle = L.circle(bridgeLatLng, {
                radius: alertRadius,
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.12,
                weight: 1.5,
                dashArray: '4, 4',
              }).addTo(map);
            }
          } else {
            // Remove circle if it became safe
            if (existing.circle) {
              existing.circle.remove();
              existing.circle = undefined;
            }
          }
        }
      }
    });
  }, [clusteredItems, vehicleHeight, alertRadius, currentLocation, zoom]);

  // Toggle "Follow me" status manually
  const toggleFollowMe = () => {
    if (!gpsActive) return;
    setIsFollowing((prev) => {
      const nextVal = !prev;
      if (nextVal && currentLocation && mapRef.current) {
        mapRef.current.setView([currentLocation.latitude, currentLocation.longitude]);
      }
      return nextVal;
    });
  };

  // Resume follow mode
  const resumeFollowing = () => {
    if (!gpsActive) return;
    setIsFollowing(true);
    if (currentLocation && mapRef.current) {
      mapRef.current.setView([currentLocation.latitude, currentLocation.longitude]);
    }
  };

  const countNearby = groupedBridges.filter(g => {
    const refLat = currentLocation ? currentLocation.latitude : defaultCenter[0];
    const refLng = currentLocation ? currentLocation.longitude : defaultCenter[1];
    const dist = getDistance(refLat, refLng, g.primaryBridge.latitude, g.primaryBridge.longitude);
    return dist <= alertRadius;
  }).length;

  return (
    <div className="flex-1 w-full flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Map Container Element - Consumes full device width via flex container layout */}
      <div id="map-canvas-container" className="relative w-full flex-1 rounded-none overflow-hidden border-t border-b border-slate-700 bg-slate-950 shadow-inner z-10">
        <div ref={mapContainerRef} className="w-full h-full" id="live-navigation-map" />

        {/* Floating Quick Add Controls */}
        <div className="absolute top-3 left-3 right-3 z-[1005] flex flex-col gap-2 pointer-events-none">
          <div className="flex items-center justify-between gap-2">
            {/* Fit Bounds ("Ver Todas") is now a floating button inside the map, taking no extra container space */}
            {filteredGroups.length > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleFitBounds();
                }}
                className="px-2.5 py-1.5 bg-slate-900/90 border border-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] font-black rounded-lg flex items-center gap-1 transition-all cursor-pointer pointer-events-auto shadow-2xl active:scale-95"
                id="btn-fit-map"
                title="Ajustar o mapa para ver todas as pontes filtradas"
              >
                <ZoomIn className="h-3.5 w-3.5 text-blue-400" />
                <span>Ver Todas</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2 pointer-events-auto">
              {/* Add Bridge Button inside the map, placed in the top right */}
              <button
                onClick={handleQuickAddClick}
                disabled={!!temporaryBridgeCoords}
                className={`w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xl active:scale-95 border ${
                  temporaryBridgeCoords
                    ? 'bg-slate-800 text-slate-500 border-slate-700 opacity-50 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white border-emerald-400/30 hover:border-emerald-400/50'
                }`}
                id="btn-permanent-add-bridge"
                title="Adicionar Ponte (Cadastro Rápido)"
              >
                <Plus className="h-5 w-5 shrink-0" />
                <span className="text-[8px] font-black uppercase tracking-tight leading-none mt-0.5 whitespace-nowrap">Add Ponte</span>
              </button>

              {selectedPoint && onOpenFormWithCoords && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFormWithCoords(selectedPoint.latitude, selectedPoint.longitude);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-[11px] font-black px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-lg border border-blue-500/20 active:scale-95 animate-pulse"
                  id="btn-detailed-add-bridge"
                  title="Registar os dados completos da ponte (altura, nome, notas, foto)"
                >
                  <span>Editar Detalhes</span>
                </button>
              )}
            </div>
          </div>

          {/* Draggable Pending Pin Adjustment Card */}
          {temporaryBridgeCoords && (
            isCapturingMode ? (
              <div className="self-center w-full max-w-xs bg-slate-900/95 border border-amber-500 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 backdrop-blur animate-in slide-in-from-top duration-300 pointer-events-auto mt-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <h4 className="text-[11px] font-black text-slate-100 uppercase tracking-wider">Captura de Ponte</h4>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-red-400 bg-red-950/40 border border-red-900/50 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 animate-pulse">
                    <Radio className="h-3 w-3 shrink-0 animate-ping" />
                    {captureCountdown !== null ? `${captureCountdown}s` : 'Ativo'}
                  </span>
                </div>

                {/* Status description */}
                <div className="bg-slate-950/60 p-2 rounded-xl text-[10px] border border-slate-800">
                  <span className="text-slate-400">Estado: </span>
                  {captureCountdown === 0 ? (
                    <span className="font-bold text-red-400">Tempo esgotado (Acompanhamento parado)</span>
                  ) : hasDraggedPino ? (
                    <span className="font-bold text-amber-400">GPS suspenso (Pino arrastado manualmente)</span>
                  ) : (
                    <span className="font-bold text-emerald-400">A seguir GPS em tempo real...</span>
                  )}
                  <div className="text-slate-500 mt-1 font-mono text-[9px] truncate">
                    Lat: {temporaryBridgeCoords.latitude.toFixed(5)}, Lng: {temporaryBridgeCoords.longitude.toFixed(5)}
                  </div>
                </div>

                {/* Photo Section */}
                <div className="flex items-center gap-3 bg-slate-950/40 p-2 rounded-xl border border-slate-800">
                  <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center shrink-0 border border-slate-700 overflow-hidden">
                    {capturedPhotoUrl ? (
                      <img src={capturedPhotoUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      {capturedPhotoUrl ? 'Foto da Ponte' : 'Sem Fotografia'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerCamera?.();
                      }}
                      className="px-2.5 py-1 text-[10px] font-black bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-md transition-all self-start cursor-pointer flex items-center gap-1 active:scale-95"
                    >
                      <Camera className="h-3 w-3 text-blue-400" />
                      <span>{capturedPhotoUrl ? 'Refazer Foto' : 'Tirar Foto'}</span>
                    </button>
                  </div>
                </div>

                {/* Actions Grid */}
                <div className="flex flex-col gap-2 mt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelCapture?.();
                      }}
                      className="h-10 text-xs font-bold bg-slate-800 hover:bg-slate-750 active:bg-slate-850 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <X className="h-4 w-4 text-red-400 shrink-0" />
                      <span>Cancelar</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUseCurrentLocation?.();
                      }}
                      disabled={!gpsActive || !currentLocation || !hasDraggedPino}
                      className={`h-10 text-xs font-bold rounded-xl transition-all border cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                        !gpsActive || !currentLocation || !hasDraggedPino
                          ? 'bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed'
                          : 'bg-indigo-950/60 border-indigo-500/30 hover:bg-indigo-900 text-indigo-300'
                      }`}
                      title="Voltar a alinhar o pino com a sua posição GPS atual"
                    >
                      <Compass className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span>Usar GPS</span>
                    </button>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfirmLocation?.();
                    }}
                    className="h-11 text-xs font-black bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/20 active:scale-95"
                  >
                    <CheckCircle2 className="h-4 w-4 text-white shrink-0" />
                    <span>Confirmar Localização</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="self-center w-full max-w-xs bg-slate-900/95 border border-amber-500/40 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 backdrop-blur animate-in slide-in-from-top duration-300 pointer-events-auto mt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                    <h4 className="text-[10px] font-black text-slate-100 uppercase tracking-wider">Ajustar Local</h4>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded-md">
                    Lat: {temporaryBridgeCoords.latitude.toFixed(5)}, Lng: {temporaryBridgeCoords.longitude.toFixed(5)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 leading-normal font-medium">
                  Arraste o pino laranja no mapa para a localização precisa.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeTemporaryCoords?.(null);
                    }}
                    className="h-9 text-xs font-bold bg-slate-800 hover:bg-slate-750 active:bg-slate-850 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <X className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    <span>Cancelar</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onQuickAdd) {
                        onQuickAdd(temporaryBridgeCoords.latitude, temporaryBridgeCoords.longitude);
                      }
                      onChangeTemporaryCoords?.(null);
                    }}
                    className="h-9 text-xs font-black bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/20 active:scale-95"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-white shrink-0" />
                    <span>Confirmar</span>
                  </button>
                </div>
              </div>
            )
          )}

          {selectedPoint && (
            <div className="self-end bg-slate-900/95 border border-slate-700 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-lg pointer-events-auto animate-in slide-in-from-top duration-200">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping shrink-0" />
              <span className="text-[10px] font-bold text-slate-200">Ponto Selecionado</span>
              <button
                onClick={handleClearSelection}
                className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                title="Limpar seleção"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Floating "Voltar a seguir" has been integrated directly into the blinking main Follow button */}

        {/* Helper overlay when GPS is off (compact visual bar, placed higher to not overlap with bottom floating buttons) */}
        {!gpsActive && (
          <div className="absolute bottom-20 right-3 left-3 bg-slate-950/90 border border-slate-800 rounded-xl p-2 z-[1005] flex items-center gap-2.5 backdrop-blur shadow-xl">
            <Map className="h-4.5 w-4.5 text-blue-400 shrink-0 animate-pulse" />
            <div className="flex-1 text-left">
              <p className="text-[9px] font-extrabold text-slate-200 leading-none">GPS Inativo</p>
              <p className="text-[8px] text-slate-400 mt-0.5">Ative a monitorização para ver o seu veículo no mapa em tempo real.</p>
            </div>
          </div>
        )}

        {/* Floating Filter Dropdown Button on the bottom-left side of the map */}
        <div className="absolute left-3 bottom-3 z-[1005] pointer-events-none">
          <div className="relative pointer-events-auto">
            {isFilterDropdownOpen && (
              <div className="absolute bottom-16 left-0 bg-slate-950/95 border border-slate-800 backdrop-blur-md rounded-2xl p-2 shadow-2xl flex flex-col gap-1 w-44 animate-in fade-in slide-in-from-bottom duration-150">
                <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider px-2.5 py-1.5 border-b border-slate-900/60">Filtro do Mapa</p>
                <button
                  onClick={() => {
                    setFilter('all');
                    setIsFilterDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl font-bold text-xs transition-colors text-left cursor-pointer ${
                    filter === 'all'
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <span>Todas</span>
                  <span className="text-[10px] opacity-60 font-mono">({groupedBridges.length})</span>
                </button>
                <button
                  onClick={() => {
                    setFilter('restricted');
                    setIsFilterDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl font-bold text-xs transition-colors text-left cursor-pointer ${
                    filter === 'restricted'
                      ? 'bg-red-600/20 text-red-400'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <span>Restritas</span>
                  <span className="text-[10px] opacity-60 font-mono">
                    ({groupedBridges.filter(g => g.altura_maxima !== null && g.altura_maxima <= vehicleHeight).length})
                  </span>
                </button>
                <button
                  onClick={() => {
                    setFilter('nearby');
                    setIsFilterDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl font-bold text-xs transition-colors text-left cursor-pointer ${
                    filter === 'nearby'
                      ? 'bg-amber-600/20 text-amber-400'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <span>Próximas</span>
                  <span className="text-[10px] opacity-60 font-mono">({countNearby})</span>
                </button>
              </div>
            )}
            
            <button
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className={`w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xl active:scale-95 border ${
                isFilterDropdownOpen || filter !== 'all'
                  ? 'bg-blue-600 text-white border-blue-400/30 hover:bg-blue-500 hover:border-blue-400/50'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-750 hover:border-slate-500'
              }`}
              id="btn-toggle-filters"
              title="Filtrar locais de pontes no mapa"
            >
              <Filter className={`h-5 w-5 shrink-0 ${(isFilterDropdownOpen || filter !== 'all') ? 'text-white' : 'text-slate-400'}`} />
              <span className="text-[8px] font-black uppercase tracking-tight leading-none mt-0.5 whitespace-nowrap">
                {filter === 'all' ? 'Filtros' : filter === 'restricted' ? 'Restritas' : 'Próximas'}
              </span>
            </button>
          </div>
        </div>

        {/* Floating Monitorization ON/OFF Button - Bottom Center */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-[1005] pointer-events-none">
          <button
            onClick={() => {
              if (gpsActive) {
                onStopMonitoring?.();
              } else {
                onStartMonitoring?.();
              }
            }}
            className={`px-4 h-14 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xl active:scale-95 border pointer-events-auto min-w-[84px] ${
              gpsActive
                ? 'bg-emerald-600 text-white border-emerald-500/30 hover:bg-emerald-500 hover:border-emerald-500/50'
                : 'bg-red-600 text-white border-red-500/30 hover:bg-red-500 hover:border-red-500/50'
            }`}
            id="btn-map-monitoring-toggle"
            title={gpsActive ? 'Parar monitorização por GPS' : 'Iniciar monitorização por GPS'}
          >
            <Radio className={`h-4.5 w-4.5 shrink-0 ${gpsActive ? 'animate-pulse text-white' : 'text-slate-100'}`} />
            <span className="text-[9px] font-black uppercase tracking-wider leading-none mt-1 whitespace-nowrap">
              GPS: {gpsActive ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {/* Floating Controls - Bottom Right Stack (Follow Me) */}
        <div className="absolute right-3 bottom-3 z-[1005] flex flex-col gap-2.5 pointer-events-none">
          {/* Follow Me Button */}
          {gpsActive && (
            <button
              onClick={!isFollowing && currentLocation ? resumeFollowing : toggleFollowMe}
              className={`w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xl active:scale-95 border pointer-events-auto ${
                isFollowing
                  ? 'bg-blue-600 text-white border-blue-400/30 hover:bg-blue-500 hover:border-blue-400/50'
                  : currentLocation
                    ? 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-300 animate-pulse ring-4 ring-yellow-400/50 font-black'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-750 hover:border-slate-500'
              }`}
              id={!isFollowing && currentLocation ? 'btn-resume-following' : 'btn-toggle-follow'}
              title={isFollowing ? 'Parar de seguir automaticamente' : 'Seguir minha localização automaticamente'}
            >
              <Navigation className={`h-5 w-5 shrink-0 ${
                isFollowing 
                  ? 'text-white animate-pulse' 
                  : currentLocation 
                    ? 'text-black animate-bounce' 
                    : 'text-slate-400'
              }`} />
              <span className="text-[8px] font-black uppercase tracking-tight leading-none mt-0.5 whitespace-nowrap">
                {isFollowing 
                  ? 'A Seguir' 
                  : currentLocation 
                    ? 'Voltar' 
                    : 'Seguir'
                }
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
