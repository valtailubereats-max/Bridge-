import React, { useState, useEffect, useRef } from 'react';
import { Bridge, VehicleConfig, AlertState, Coordinates } from './types';
import { INITIAL_BRIDGES } from './data/mockBridges';
import { getDistance, formatDistance, getDepotCoords } from './utils/geo';
import { initAudio, stopAlarm } from './utils/audio';
import { getGroupedBridges } from './utils/bridgeGroup';

// Subcomponents
import ConfigurationModal from './components/ConfigurationModal';
import BridgeForm from './components/BridgeForm';
import BridgeList from './components/BridgeList';
import AlertOverlay from './components/AlertOverlay';
import DataExportImport from './components/DataExportImport';
import InteractiveMap from './components/InteractiveMap';

// Icons
import {
  Truck,
  Navigation,
  MapPin,
  PlusCircle,
  List,
  AlertTriangle,
  Settings,
  ShieldCheck,
  Radio,
  FileDown,
  Info,
  HelpCircle,
  Bell,
  Heart,
  Volume2,
  VolumeX,
  X,
  CheckCircle2,
  Sun,
  Moon,
  SunMoon,
  Globe
} from 'lucide-react';

export default function App() {
  // --- Persistent States ---
  const [bridges, setBridges] = useState<Bridge[]>(() => {
    const saved = localStorage.getItem('low_bridge_bridges');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Se a base de dados local tiver referências a dados antigos/legados de teste (ex: sys-bridge-1 ou o antigo sys-bridge-portsmouth),
        // ou se não contiver as 8 pontes padrão do Reino Unido, migramos automaticamente para a nova região padrão (Portsmouth / Southampton)
        const containsLegacyData = parsed.some((b: any) => b.id && (b.id.includes('sys-bridge-1') || b.id === 'sys-bridge-portsmouth'));
        const systemBridgesCount = parsed.filter((b: any) => b.origem === 'sistema').length;
        if (!containsLegacyData && systemBridgesCount >= 8) {
          return parsed;
        }
      } catch (e) {
        console.error('Error parsing saved bridges', e);
      }
    }
    return INITIAL_BRIDGES;
  });

  const [vehicleConfig, setVehicleConfig] = useState<VehicleConfig>(() => {
    const saved = localStorage.getItem('low_bridge_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          deposito_central: 'Southampton',
          raio_captura_pontes: 100,
          raio_alerta: 300,
          altura_minima_ponte: parsed.altura_veiculo ? parseFloat((parsed.altura_veiculo - 0.20).toFixed(2)) : 0,
          ...parsed
        };
      } catch (e) {
        console.error('Error parsing vehicle config', e);
      }
    }
    return {
      altura_veiculo: 0,
      apelido_veiculo: '',
      raio_alerta: 300,
      deposito_central: 'Southampton',
      raio_captura_pontes: 100,
      altura_minima_ponte: 0,
      configurado: false
    };
  });

  // --- Theme States & Auto Night Mode ---
  const [themeSetting, setThemeSetting] = useState<'auto' | 'light' | 'dark'>(() => {
    const saved = localStorage.getItem('low_bridge_theme_setting');
    return (saved as 'auto' | 'light' | 'dark') || 'auto';
  });

  const [isNightTime, setIsNightTime] = useState<boolean>(() => {
    const hour = new Date().getHours();
    return hour >= 19 || hour < 7;
  });

  useEffect(() => {
    localStorage.setItem('low_bridge_theme_setting', themeSetting);
  }, [themeSetting]);

  useEffect(() => {
    const checkTime = () => {
      const hour = new Date().getHours();
      setIsNightTime(hour >= 19 || hour < 7);
    };
    checkTime();
    const interval = setInterval(checkTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const activeTheme = themeSetting === 'auto'
    ? (isNightTime ? 'dark' : 'light')
    : themeSetting;

  // --- Runtime States ---
  const [gpsActive, setGpsActive] = useState<boolean>(() => {
    return localStorage.getItem('low_bridge_monitoring_active') === 'true';
  });
  const watchIdRef = useRef<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(() => {
    const saved = localStorage.getItem('low_bridge_last_location');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [activeAlert, setActiveAlert] = useState<AlertState | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);

  // Auto-switch to Bolinha 1 when an alert is fired (activeAlert is truthy)
  useEffect(() => {
    if (activeAlert) {
      setActiveTab(1);
    }
  }, [activeAlert]);

  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});

  // --- Computed Visible Bridges based on Current Location, Capture Radius, and Minimum Bridge Height (Requirement) ---
  const visibleBridges = React.useMemo(() => {
    const radiusMiles = vehicleConfig.raio_captura_pontes || 50;
    const radiusMeters = radiusMiles * 1609.34;
    const minBridgeHeight = vehicleConfig.altura_minima_ponte || 0;

    return bridges.filter((b) => {
      // 1. Filter by Current Location Proximity (if GPS active and coordinates are available)
      if (currentLocation) {
        const dist = getDistance(currentLocation.latitude, currentLocation.longitude, b.latitude, b.longitude);
        if (dist > radiusMeters) return false;
      }

      // 2. Filter by Minimum Bridge Height (if configured)
      if (minBridgeHeight > 0 && b.altura_maxima !== null && b.altura_maxima < minBridgeHeight) {
        return false;
      }

      return true;
    });
  }, [bridges, currentLocation, vehicleConfig.raio_captura_pontes, vehicleConfig.altura_minima_ponte]);

  const visibleBridgesRef = useRef(visibleBridges);
  useEffect(() => {
    visibleBridgesRef.current = visibleBridges;
  }, [visibleBridges]);

  const [lastAlert, setLastAlert] = useState<{
    bridgeName: string;
    altura_ponte: number;
    distancia: number;
    timestamp: string;
  } | null>(() => {
    const saved = localStorage.getItem('low_bridge_last_alert');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing last alert', e);
      }
    }
    return null;
  });

  // --- View Management ---
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showAddBridgeForm, setShowAddBridgeForm] = useState(false);
  const [showBridgesList, setShowBridgesList] = useState(false);
  const [editingBridge, setEditingBridge] = useState<Bridge | null>(null);
  const [mapPrefilledCoords, setMapPrefilledCoords] = useState<Coordinates | null>(null);

  // --- Filter Management ---
  const [filterMode, setFilterMode] = useState<'all' | 'restricted' | 'nearby'>(() => {
    const saved = localStorage.getItem('low_bridge_filter_mode');
    return (saved as 'all' | 'restricted' | 'nearby') || 'all';
  });

  // --- Quick Add & Captura de Ponte State ---
  const [quickAddCoords, setQuickAddCoords] = useState<Coordinates | null>(null);
  const [isCapturingMode, setIsCapturingMode] = useState<boolean>(false);
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string>('');
  const [hasDraggedPino, setHasDraggedPino] = useState<boolean>(false);

  const handleAutoCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedPhotoUrl(reader.result as string);
        setToast({
          message: 'Fotografia da ponte registada temporariamente!',
          type: 'success'
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerAutoCamera = () => {
    const input = document.getElementById('auto-camera-input') as HTMLInputElement;
    if (input) {
      input.click();
    }
  };

  const handleStartCaptureMode = () => {
    // 1. Create immediate temporary pin (using currentLocation or a fallback)
    const lat = currentLocation ? currentLocation.latitude : (mapPrefilledCoords ? mapPrefilledCoords.latitude : 50.803600);
    const lng = currentLocation ? currentLocation.longitude : (mapPrefilledCoords ? mapPrefilledCoords.longitude : -1.075600);
    
    setQuickAddCoords({ latitude: lat, longitude: lng });
    setHasDraggedPino(false);
    setCapturedPhotoUrl('');
    
    // 2. Start capturing mode
    setIsCapturingMode(true);
    setCaptureCountdown(60);
    
    // Force start monitoring if not active so we get GPS signals
    if (!gpsActive) {
      handleStartMonitoring();
    }
    
    // 3. Try to open the camera automatically
    setTimeout(() => {
      triggerAutoCamera();
    }, 150);

    setToast({
      message: 'Modo Captura de Ponte Ativo! Acompanhando GPS por 1 minuto...',
      type: 'info'
    });
  };

  const handleConfirmLocation = () => {
    // If we have current location, use it to substitute the pin position, otherwise use the dragged pin position
    const finalCoords = currentLocation || quickAddCoords;
    if (finalCoords) {
      setMapPrefilledCoords(finalCoords);
      setEditingBridge(null);
      setShowAddBridgeForm(true);
    }
    
    setIsCapturingMode(false);
    setCaptureCountdown(null);
    setToast({
      message: 'Localização confirmada! Defina os detalhes da ponte.',
      type: 'success'
    });
  };

  const handleCancelCapture = () => {
    setIsCapturingMode(false);
    setCaptureCountdown(null);
    setQuickAddCoords(null);
    setCapturedPhotoUrl('');
    setHasDraggedPino(false);
    setToast({
      message: 'Modo Captura cancelado.',
      type: 'info'
    });
  };

  const handleUseCurrentLocation = () => {
    if (currentLocation) {
      setQuickAddCoords(currentLocation);
      setHasDraggedPino(false);
      setToast({
        message: 'A usar localização GPS atual para o pino.',
        type: 'success'
      });
    } else {
      setToast({
        message: 'GPS indisponível de momento.',
        type: 'error'
      });
    }
  };

  const handleTriggerCamera = () => {
    triggerAutoCamera();
  };

  const handleTemporaryCoordsChange = (coords: Coordinates | null) => {
    setQuickAddCoords(coords);
    if (coords && isCapturingMode) {
      setHasDraggedPino(true);
    }
  };

  // --- Toast Notification state ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // --- Sound, Button Config and OSM Importer States ---
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(() => {
    return localStorage.getItem('low_bridge_sound_muted') === 'true';
  });
  const [isAddBridgeButtonEnabled, setIsAddBridgeButtonEnabled] = useState<boolean>(() => {
    return localStorage.getItem('low_bridge_enable_add_button') === 'true';
  });
  const [isOsmImporting, setIsOsmImporting] = useState(false);
  const [osmImportingStatus, setOsmImportingStatus] = useState<string | null>(null);

  const [lastImportCoords, setLastImportCoords] = useState<Coordinates | null>(() => {
    const saved = localStorage.getItem('low_bridge_last_import_coords');
    return saved ? JSON.parse(saved) : null;
  });
  const [dismissedOsmImportCoords, setDismissedOsmImportCoords] = useState<Coordinates | null>(null);
  const [showNewAreaAlert, setShowNewAreaAlert] = useState<boolean>(false);

  // Suggest OSM bridge loading when driver moves to a new uncharted region
  useEffect(() => {
    if (!currentLocation || !gpsActive) {
      setShowNewAreaAlert(false);
      return;
    }

    // Convert capturing radius from miles to meters
    const radiusMeters = (vehicleConfig.raio_captura_pontes || 25) * 1609.34;
    // We consider it a "new area" if they move more than 70% of the radius away
    const thresholdMeters = radiusMeters * 0.7;

    if (!lastImportCoords) {
      // No import done yet. If they already dismissed the prompt nearby, do not show again
      if (dismissedOsmImportCoords) {
        const distDismissed = getDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          dismissedOsmImportCoords.latitude,
          dismissedOsmImportCoords.longitude
        );
        if (distDismissed < thresholdMeters) {
          setShowNewAreaAlert(false);
          return;
        }
      }
      setShowNewAreaAlert(true);
    } else {
      const distImported = getDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        lastImportCoords.latitude,
        lastImportCoords.longitude
      );

      // If they dismissed a prompt nearby, don't show it either
      if (dismissedOsmImportCoords) {
        const distDismissed = getDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          dismissedOsmImportCoords.latitude,
          dismissedOsmImportCoords.longitude
        );
        if (distDismissed < thresholdMeters) {
          setShowNewAreaAlert(false);
          return;
        }
      }

      if (distImported > thresholdMeters) {
        setShowNewAreaAlert(true);
      } else {
        setShowNewAreaAlert(false);
      }
    }
  }, [currentLocation, gpsActive, lastImportCoords, dismissedOsmImportCoords, vehicleConfig.raio_captura_pontes]);

  useEffect(() => {
    localStorage.setItem('low_bridge_sound_muted', String(isSoundMuted));
  }, [isSoundMuted]);

  useEffect(() => {
    localStorage.setItem('low_bridge_enable_add_button', String(isAddBridgeButtonEnabled));
  }, [isAddBridgeButtonEnabled]);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // 1-minute countdown timer for Captura de Ponte mode
  useEffect(() => {
    let interval: any = null;
    if (isCapturingMode && captureCountdown !== null && captureCountdown > 0) {
      interval = setInterval(() => {
        setCaptureCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            setToast({
              message: 'Tempo de acompanhamento GPS esgotado. Mantendo o pino na última posição.',
              type: 'info'
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCapturingMode, captureCountdown]);

  // Sync temporary pin coordinates with current GPS location if not dragged manually
  useEffect(() => {
    if (isCapturingMode && captureCountdown !== null && captureCountdown > 0 && !hasDraggedPino) {
      if (currentLocation) {
        setQuickAddCoords(currentLocation);
      }
    }
  }, [currentLocation, isCapturingMode, captureCountdown, hasDraggedPino]);



  // --- Safety Refs to Prevent Stale Closures inside Geolocation callbacks ---
  const cooldownsRef = useRef(cooldowns);
  const bridgesRef = useRef(bridges);
  const vehicleConfigRef = useRef(vehicleConfig);
  const quickAddCoordsRef = useRef(quickAddCoords);
  const gpsActiveRef = useRef(gpsActive);

  // Keep safety references synchronized with state updates
  useEffect(() => {
    cooldownsRef.current = cooldowns;
  }, [cooldowns]);

  useEffect(() => {
    bridgesRef.current = bridges;
  }, [bridges]);

  useEffect(() => {
    vehicleConfigRef.current = vehicleConfig;
  }, [vehicleConfig]);

  useEffect(() => {
    quickAddCoordsRef.current = quickAddCoords;
  }, [quickAddCoords]);

  useEffect(() => {
    gpsActiveRef.current = gpsActive;
  }, [gpsActive]);

  // --- Effects ---
  // Sync filterMode to localStorage
  useEffect(() => {
    localStorage.setItem('low_bridge_filter_mode', filterMode);
  }, [filterMode]);

  // Sync GPS Active state to localStorage
  useEffect(() => {
    localStorage.setItem('low_bridge_monitoring_active', String(gpsActive));
  }, [gpsActive]);

  // Sync current GPS location to localStorage
  useEffect(() => {
    if (currentLocation) {
      localStorage.setItem('low_bridge_last_location', JSON.stringify(currentLocation));
    }
  }, [currentLocation]);

  // Sync bridges to localStorage
  useEffect(() => {
    localStorage.setItem('low_bridge_bridges', JSON.stringify(bridges));
  }, [bridges]);

  // Sync vehicle config to localStorage
  useEffect(() => {
    localStorage.setItem('low_bridge_config', JSON.stringify(vehicleConfig));
    // If we just configured the vehicle, open first setup if needed
    if (!vehicleConfig.configurado) {
      setShowConfigModal(true);
    }
  }, [vehicleConfig]);

  // Sync last alert to localStorage
  useEffect(() => {
    if (lastAlert) {
      localStorage.setItem('low_bridge_last_alert', JSON.stringify(lastAlert));
    }
  }, [lastAlert]);

  // Cleanup GPS watching on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // --- Unified Alert Checker ---
  const checkBridgesForAlerts = (lat: number, lng: number) => {
    const now = Date.now();
    let triggeredAlert: AlertState | null = null;

    const currentBridges = visibleBridgesRef.current;
    const vHeight = vehicleConfigRef.current.altura_veiculo;
    const vRadius = vehicleConfigRef.current.raio_alerta;

    // Use dynamically grouped bridges for alerts and safety checking
    const grouped = getGroupedBridges(currentBridges);
    let bestAlert: AlertState | null = null;

    for (const group of grouped) {
      const bridge = group.primaryBridge;
      // 1. Calculate distance to primary/representative bridge
      const distance = getDistance(lat, lng, bridge.latitude, bridge.longitude);

      // 2. Check if within alert radius
      if (distance <= vRadius) {
        // 3. Check risk level: 'danger' if bridge height <= vehicle height OR height is pending/null
        const isDangerous = group.altura_maxima === null || group.altura_maxima <= vHeight;
        const alertType: 'danger' | 'attention' = isDangerous ? 'danger' : 'attention';

        // 4. Check Cooldowns (5 minutes / 300,000ms per bridge location ID)
        const lastDismissed = cooldownsRef.current[bridge.id] || 0;
        if (now - lastDismissed > 300000) {
          // Synthesize a Bridge with consolidated properties
          const synthesizedBridge: Bridge = {
            ...bridge,
            altura_maxima: group.altura_maxima,
            confidenceStatus: group.confidenceStatus,
            reportsCount: group.reportsCount,
            photoDataUrl: group.photoDataUrl,
          };

          const alertCandidate: AlertState = {
            bridge: synthesizedBridge,
            distancia: distance,
            vehicleHeight: vHeight,
            timestamp: now,
            alertType: alertType,
          };

          // Prioritization: 
          // - If no alert found yet, accept this candidate.
          // - If current candidate is 'danger' and best is only 'attention', override with 'danger'.
          // - If alert types are identical, prioritize the one that is closer.
          if (!bestAlert) {
            bestAlert = alertCandidate;
          } else if (alertType === 'danger' && bestAlert.alertType === 'attention') {
            bestAlert = alertCandidate;
          } else if (alertType === bestAlert.alertType && distance < bestAlert.distancia) {
            bestAlert = alertCandidate;
          }
        }
      }
    }

    triggeredAlert = bestAlert;

    if (triggeredAlert) {
      setActiveAlert(triggeredAlert);
      setLastAlert({
        bridgeName: triggeredAlert.bridge.nome,
        altura_ponte: triggeredAlert.bridge.altura_maxima || 0,
        distancia: triggeredAlert.distancia,
        timestamp: new Date().toLocaleTimeString()
      });
    } else {
      // Clear alert if we walked out of danger zone
      setActiveAlert(null);
    }
  };

  // --- GPS Toggle Actions ---
  const handleStartMonitoring = () => {
    if (gpsActive) return;
    
    // Initialize Web Audio API in response to driver click
    initAudio();

    if (!vehicleConfig.configurado) {
      alert('Por favor, configure a altura do seu veículo antes de iniciar a monitorização.');
      setShowConfigModal(true);
      return;
    }

    if (!navigator.geolocation) {
      alert('O seu telemóvel não suporta Geolocalização por GPS.');
      return;
    }

    setGpsActive(true);
  };

  const handleStopMonitoring = () => {
    setGpsActive(false);
  };

  // Handle start/stop Geolocation watching based on gpsActive state
  useEffect(() => {
    if (gpsActive) {
      if (watchIdRef.current !== null) return; // already active

      // Initialize Web Audio API
      initAudio();

      if (!vehicleConfig.configurado) {
        setShowConfigModal(true);
        setGpsActive(false);
        return;
      }

      if (!navigator.geolocation) {
        alert('O seu telemóvel não suporta Geolocalização por GPS.');
        setGpsActive(false);
        return;
      }

      const startWatching = () => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const coords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            };
            setCurrentLocation(coords);
            
            // Check for alerts
            checkBridgesForAlerts(
              coords.latitude,
              coords.longitude
            );
          },
          (error) => {
            console.warn('[GPS] Watch status warning:', error.code, error.message);
            // Some mobile devices raise temporary timeout errors (code 3) when locked or in background.
            // We do not want to force-stop monitoring or show annoying alerts for transient timeouts.
            // We only stop and alert if it is a severe PERMISSION_DENIED (code 1) error.
            if (error.code === 1) { // PERMISSION_DENIED
              alert('Não foi possível obter a sua localização GPS. Verifique as permissões de localização no telemóvel.');
              setGpsActive(false);
            } else {
              // Code 2 (POSITION_UNAVAILABLE) or Code 3 (TIMEOUT).
              // On many mobile browsers, the watcher stream can freeze or die after an error.
              // Let's schedule a clean watch restart in 3 seconds to recover connection with the GPS hardware.
              console.log('[GPS] Temporary error, scheduling a watch restart in 3 seconds...');
              setTimeout(() => {
                if (gpsActiveRef.current) {
                  startWatching();
                }
              }, 3000);
            }
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
          }
        );
      };

      startWatching();

      // Listen for visibility and focus changes to restart tracking if it becomes stale (highly common in mobile PWAs)
      const handleVisibilityChange = (e: Event) => {
        if (e.type === 'visibilitychange' && document.visibilityState === 'hidden') {
          return;
        }
        if (gpsActiveRef.current) {
          console.log('[GPS] Window visible or focused, refreshing geolocation stream...');
          startWatching();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleVisibilityChange);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleVisibilityChange);
      };
    } else {
      // If monitoring is disabled, clean up
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setCurrentLocation(null);
      setActiveAlert(null);
      stopAlarm();
    }
  }, [gpsActive, vehicleConfig.configurado]);

  // --- Alert Dismissal ---
  const handleDismissAlert = () => {
    if (activeAlert) {
      // Apply a 5-minute cooldown for this specific bridge
      setCooldowns((prev) => ({
        ...prev,
        [activeAlert.bridge.id]: Date.now()
      }));
    }
    setActiveAlert(null);
    stopAlarm();
  };

  // --- Bridge CRUD Actions ---
  const handleSaveBridge = (newBridgeData: Partial<Bridge> & {
    nome: string;
    latitude: number;
    longitude: number;
    altura_maxima: number;
    notas: string;
    photoDataUrl?: string;
  }) => {
    if (newBridgeData.id) {
      // Editing Existing
      setBridges((prev) =>
        prev.map((b) =>
          b.id === newBridgeData.id
            ? {
                ...b,
                nome: newBridgeData.nome,
                latitude: newBridgeData.latitude,
                longitude: newBridgeData.longitude,
                altura_maxima: newBridgeData.altura_maxima,
                notas: newBridgeData.notas,
                photoDataUrl: newBridgeData.photoDataUrl ?? b.photoDataUrl,
                confirmada: newBridgeData.confirmada ?? b.confirmada,
                reportedHeights: b.reportedHeights
                  ? [...b.reportedHeights.filter(h => h !== b.altura_maxima), newBridgeData.altura_maxima]
                  : [newBridgeData.altura_maxima],
              }
            : b
        )
      );
    } else {
      // Adding New
      const brandNew: Bridge = {
        id: `motorista-${Math.random().toString(36).substr(2, 9)}`,
        nome: newBridgeData.nome,
        latitude: newBridgeData.latitude,
        longitude: newBridgeData.longitude,
        altura_maxima: newBridgeData.altura_maxima,
        notas: newBridgeData.notas,
        data_criacao: new Date().toISOString(),
        origem: 'motorista',
        confirmada: false,
        photoDataUrl: newBridgeData.photoDataUrl,
        reportsCount: 1,
        reportedHeights: [newBridgeData.altura_maxima],
        confidenceStatus: 'reportada_por_1_motorista',
        source: 'driver',
        status: 'active',
      };
      setBridges((prev) => [brandNew, ...prev]);
    }
    setEditingBridge(null);
  };

  const handleImportFromOSM = async () => {
    // Tenta usar a localização do GPS; caso contrário, usa a localização do Depósito Central ativo
    const targetCoords = currentLocation || getDepotCoords(vehicleConfig.deposito_central);

    if (!targetCoords) {
      setToast({
        message: 'Por favor, selecione um depósito ou ative o GPS para importar pontes.',
        type: 'error'
      });
      return;
    }

    const localizacaoTexto = currentLocation 
      ? 'posição GPS atual' 
      : `região do Depósito Central (${vehicleConfig.deposito_central})`;

    setIsOsmImporting(true);
    setOsmImportingStatus(`A iniciar ligação com o Overpass API (${localizacaoTexto})...`);
    
    try {
      const { importBridgesFromOSM } = await import('./utils/overpass');
      const result = await importBridgesFromOSM(
        bridges,
        targetCoords.latitude,
        targetCoords.longitude,
        vehicleConfig.raio_captura_pontes,
        (status) => {
          setOsmImportingStatus(status);
        },
        vehicleConfig.altura_minima_ponte
      );

      if (result.importedBridges.length > 0) {
        setBridges((prev) => {
          const merged = [...result.importedBridges, ...prev];
          localStorage.setItem('low_bridge_bridges', JSON.stringify(merged));
          return merged;
        });
        setToast({
          message: `Sucesso! Foram importadas ${result.importedBridges.length} novas pontes de forma automática na ${localizacaoTexto}.`,
          type: 'success'
        });
      } else {
        setToast({
          message: `Nenhuma nova ponte encontrada nesta área (${localizacaoTexto}). (Puladas: ${result.skippedCount})`,
          type: 'info'
        });
      }

      // Save last imported coordinates on success to prevent repeated popups in the same region
      setLastImportCoords(targetCoords);
      localStorage.setItem('low_bridge_last_import_coords', JSON.stringify(targetCoords));

      setOsmImportingStatus(
        `Importação concluída para ${localizacaoTexto}! Novas pontes: ${result.importedBridges.length}. Puladas: ${result.skippedCount}. Erros: ${result.errorCount}.`
      );
    } catch (error) {
      console.error('Failed to import OSM bridges', error);
      setToast({
        message: 'Falha crítica na importação automática de pontes.',
        type: 'error'
      });
      setOsmImportingStatus('Erro ao importar. Certifique-se de que está online e tente novamente.');
    } finally {
      setIsOsmImporting(false);
    }
  };

  const handleUpdateExistingBridgeInfo = (id: string, altura: number, notas: string, photoDataUrl?: string) => {
    setBridges((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              altura_maxima: altura,
              notas: b.notas ? `${b.notas} | ${notas}` : notas,
              photoDataUrl: photoDataUrl ?? b.photoDataUrl,
              confirmada: true, // Auto confirm when corrected
              reportsCount: (b.reportsCount || 1) + 1,
              reportedHeights: [...(b.reportedHeights || [b.altura_maxima]), altura],
            }
          : b
      )
    );
  };

  const handleDeleteBridge = (id: string) => {
    let updated: Bridge[] = [];
    if (id.includes(',')) {
      const ids = id.split(',');
      setBridges((prev) => {
        updated = prev.filter((b) => !ids.includes(b.id));
        localStorage.setItem('low_bridge_bridges', JSON.stringify(updated));
        return updated;
      });
    } else {
      setBridges((prev) => {
        updated = prev.filter((b) => b.id !== id);
        localStorage.setItem('low_bridge_bridges', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleToggleConfirmBridge = (id: string, confirmed: boolean) => {
    setBridges((prev) =>
      prev.map((b) => (b.id === id ? { ...b, confirmada: confirmed } : b))
    );
  };

  const handleQuickAddBridge = (latitude: number, longitude: number) => {
    const nowIso = new Date().toISOString();

    const brandNew: Bridge = {
      id: `quick-${Math.random().toString(36).substring(2, 11)}`,
      nome: 'Ponte adicionada',
      latitude: latitude,
      longitude: longitude,
      altura_maxima: null,
      notas: '',
      data_criacao: nowIso,
      origem: 'motorista',
      confirmada: false,
      reportsCount: 1,
      reportedHeights: [],
      confidenceStatus: 'nao_confirmada',
      source: 'user',
      status: 'active',
      title: 'Ponte adicionada',
      createdAt: nowIso,
      height: null,
      notes: '',
    };

    setBridges((prev) => {
      const updated = [brandNew, ...prev];
      localStorage.setItem('low_bridge_bridges', JSON.stringify(updated));
      return updated;
    });

    setToast({
      message: 'Ponte criada por Cadastro Rápido!',
      type: 'success',
    });
  };

  const handleOpenFormWithCoords = (lat: number, lng: number) => {
    setMapPrefilledCoords({ latitude: lat, longitude: lng });
    setEditingBridge(null);
    setShowAddBridgeForm(true);
  };

  const handleImportBridgesList = (importedList: Bridge[]) => {
    setBridges(importedList);
  };

  // Determine current active alert safety status colors
  const getSafetyStatus = () => {
    if (!gpsActive) return { bg: 'bg-slate-800/80 border-slate-700', text: 'Monitorização Inativa', desc: 'Ligue a monitorização para receber os alertas', color: 'text-slate-400' };
    
    if (!currentLocation) {
      return {
        bg: 'bg-yellow-950/20 border-yellow-500/40 text-yellow-400 animate-pulse',
        text: '🛰️ PROCURANDO SINAL DE GPS...',
        desc: 'Aguardando que o telemóvel obtenha a localização atual do veículo.',
        color: 'text-yellow-400'
      };
    }

    // Check if there is any bridge within the configured warning radius
    let nearestBridge: Bridge | null = null;
    let minDistance = Infinity;

    if (currentLocation) {
      visibleBridges.forEach((b) => {
        const dist = getDistance(currentLocation.latitude, currentLocation.longitude, b.latitude, b.longitude);
        if (dist < minDistance) {
          minDistance = dist;
          nearestBridge = b;
        }
      });
    }

    if (nearestBridge && minDistance <= vehicleConfig.raio_alerta) {
      const nearestBridgeObj = nearestBridge as Bridge;
      const isDanger = nearestBridgeObj.altura_maxima === null || nearestBridgeObj.altura_maxima <= vehicleConfig.altura_veiculo;
      if (isDanger) {
        const heightDesc = nearestBridgeObj.altura_maxima !== null ? `${nearestBridgeObj.altura_maxima}m` : 'Altura não verificada';
        return {
          bg: 'bg-red-950/40 border-red-500 text-red-400 animate-pulse',
          text: '⚠️ PERIGO - PONTE BAIXA DETETADA',
          desc: `Aproximação de ${nearestBridgeObj.nome} (${heightDesc}) (${formatDistance(minDistance)})!`,
          color: 'text-red-500'
        };
      } else {
        return {
          bg: 'bg-yellow-950/20 border-yellow-500/40 text-yellow-400',
          text: '⚠️ ATENÇÃO - PONTE SEGURA PRÓXIMA',
          desc: `Ponte com ${nearestBridgeObj.altura_maxima}m (o seu veículo tem ${vehicleConfig.altura_veiculo}m).`,
          color: 'text-yellow-500'
        };
      }
    }

    return {
      bg: 'bg-emerald-950/20 border-emerald-500/40 text-emerald-400',
      text: '✅ ESTRADA SEGURA',
      desc: 'GPS ativo e vias monitorizadas. Nenhuma ponte perigosa por perto.',
      color: 'text-emerald-500'
    };
  };

  const status = getSafetyStatus();

  return (
    <div className={`bg-slate-900 text-slate-100 font-sans w-full relative flex flex-col justify-between theme-${activeTheme} ${
      activeTab === 1 
        ? 'h-screen h-[100dvh] overflow-hidden pb-0' 
        : 'min-h-screen pb-12'
    }`}>
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] text-white font-extrabold text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 border animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'error' 
            ? 'bg-red-600 border-red-500/20' 
            : toast.type === 'info'
              ? 'bg-blue-600 border-blue-500/20'
              : 'bg-emerald-500 border-emerald-400/20'
        }`}>
          <span className="h-2 w-2 rounded-full bg-white animate-pulse shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* 3 Circular Navigation Buttons (Bolinhas) - Extremely Clean Header */}
      <div className="flex justify-center items-center gap-6 py-5 sticky top-0 z-30 chumbo-ranhuras backdrop-blur-md">
        <button
          onClick={() => {
            setActiveTab(1);
            setToast({ message: 'Modo de Condução (Principal)', type: 'info' });
          }}
          className={`h-7 w-7 rounded-full border-2 transition-all cursor-pointer ${
            activeTab === 1
              ? 'bg-red-500 border-red-400 scale-125 shadow-lg shadow-red-500/50'
              : 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:scale-110'
          }`}
          id="btn-nav-bolinha-1"
          title="Modo Principal (Mapa)"
        />
        <button
          onClick={() => {
            setActiveTab(2);
            setToast({ message: 'Painel de Viagem', type: 'info' });
          }}
          className={`h-7 w-7 rounded-full border-2 transition-all cursor-pointer ${
            activeTab === 2
              ? 'bg-emerald-500 border-emerald-400 scale-125 shadow-lg shadow-emerald-500/50'
              : 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:scale-110'
          }`}
          id="btn-nav-bolinha-2"
          title="Modo Secundário (Status)"
        />
        <button
          onClick={() => {
            setActiveTab(3);
            setToast({ message: 'Configurações e Administração', type: 'info' });
          }}
          className={`h-7 w-7 rounded-full border-2 transition-all cursor-pointer ${
            activeTab === 3
              ? 'bg-blue-500 border-blue-400 scale-125 shadow-lg shadow-blue-500/50'
              : 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:scale-110'
          }`}
          id="btn-nav-bolinha-3"
          title="Configurações e Administração"
        />
      </div>

      {/* BODY CONTAINER */}
      <main className={`flex-1 ${
        activeTab === 1 
          ? 'p-0 flex flex-col overflow-hidden' 
          : 'p-5 space-y-6'
      }`}>
        
        {/* BOLINHA 1: MODO PRINCIPAL (Navegação & Mapa) */}
        {activeTab === 1 && (
          <div className="flex-1 w-full flex flex-col overflow-hidden relative animate-in fade-in duration-200">
            {/* New Region / OSM Auto-import suggestion banner */}
            {showNewAreaAlert && gpsActive && currentLocation && (
              <div className="absolute top-16 left-3 right-3 z-[1010] bg-slate-950/95 border border-yellow-500/30 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-4 fade-in duration-300 flex flex-col sm:flex-row items-center gap-3">
                <div className="p-2 bg-yellow-400/10 text-yellow-400 rounded-xl shrink-0 animate-pulse">
                  <Globe className="h-5 w-5" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h4 className="text-xs font-black text-slate-100 leading-snug">Nova região detetada!</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                    Encontra-se numa nova área sem pontes carregadas de OpenStreetMap. Deseja importar o raio de {vehicleConfig.raio_captura_pontes || 25} mi?
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 mt-1 sm:mt-0">
                  <button
                    onClick={() => {
                      setDismissedOsmImportCoords(currentLocation);
                      setShowNewAreaAlert(false);
                    }}
                    className="flex-1 sm:flex-initial text-slate-400 hover:text-slate-200 text-[10px] font-bold px-2.5 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  >
                    Dispensar
                  </button>
                  <button
                    onClick={async () => {
                      await handleImportFromOSM();
                    }}
                    disabled={isOsmImporting}
                    className="flex-1 sm:flex-initial bg-yellow-400 hover:bg-yellow-300 text-black text-[10px] font-black px-3 py-1.5 rounded-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-yellow-500/10 disabled:opacity-50 whitespace-nowrap"
                  >
                    {isOsmImporting ? (
                      <>
                        <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                        <span>A importar...</span>
                      </>
                    ) : (
                      <span>Importar</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* INTERACTIVE MAP (Always visible in Bolinha 1) */}
            <InteractiveMap
              bridges={visibleBridges}
              currentLocation={currentLocation}
              vehicleHeight={vehicleConfig.altura_veiculo}
              alertRadius={vehicleConfig.raio_alerta}
              gpsActive={gpsActive}
              filter={filterMode}
              setFilter={setFilterMode}
              onQuickAdd={handleQuickAddBridge}
              onOpenFormWithCoords={handleOpenFormWithCoords}
              onEdit={(bridge) => {
                setEditingBridge(bridge);
                setShowAddBridgeForm(true);
              }}
              onDelete={handleDeleteBridge}
              temporaryBridgeCoords={quickAddCoords}
              onChangeTemporaryCoords={handleTemporaryCoordsChange}
              activeTheme={activeTheme}
              isAddBridgeButtonEnabled={isAddBridgeButtonEnabled}
              onStartMonitoring={handleStartMonitoring}
              onStopMonitoring={handleStopMonitoring}
              isCapturingMode={isCapturingMode}
              captureCountdown={captureCountdown}
              capturedPhotoUrl={capturedPhotoUrl}
              hasDraggedPino={hasDraggedPino}
              onConfirmLocation={handleConfirmLocation}
              onCancelCapture={handleCancelCapture}
              onUseCurrentLocation={handleUseCurrentLocation}
              onTriggerCamera={handleTriggerCamera}
              onStartCaptureMode={handleStartCaptureMode}
            />

            {/* Quick add handled instantly */}
          </div>
        )}

        {/* BOLINHA 2: PAINEL DE VIAGEM E STATUS (Informação Secundária) */}
        {activeTab === 2 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* VEHICLE CONFIG SUMMARY CARD */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-3xl p-4 flex items-center justify-between shadow-md">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl">
                  <Truck className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Altura Monitorizada</span>
                  <h2 className="text-xl font-black text-slate-100 font-mono leading-tight">
                    {vehicleConfig.configurado ? `${vehicleConfig.altura_veiculo.toFixed(2)}m` : 'Não Configurado'}
                  </h2>
                  <p className="text-[11px] text-slate-400 font-sans truncate max-w-[150px]">
                    {vehicleConfig.apelido_veiculo || 'Camião / Van'}
                  </p>
                </div>
              </div>

              <div className="text-right flex flex-col items-end gap-1">
                <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Localização / Cobertura</span>
                <span className="bg-emerald-500/10 text-emerald-400 font-sans text-[11px] font-bold px-2 py-1 rounded-lg border border-emerald-500/20">
                  {currentLocation ? 'Localização Atual' : 'Localização GPS'} ({vehicleConfig.raio_captura_pontes || 50} mi)
                </span>
                <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider mt-1">Raio Alerta</span>
                <span className="bg-red-500/10 text-red-400 font-mono text-xs font-bold px-2.5 py-1 rounded-lg border border-red-500/20">
                  {vehicleConfig.raio_alerta}m
                </span>
              </div>
            </div>

            {/* GPS STATE BAR / LIVE CABIN STATUS */}
            <div className={`border rounded-3xl p-4 transition-all duration-300 shadow-md ${status.bg}`} id="gps-status-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-extrabold tracking-wider">{status.text}</span>
                <div className="flex items-center space-x-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${gpsActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                  <span className="text-[11px] font-bold text-slate-300">
                    {gpsActive ? 'GPS ATIVO' : 'GPS INATIVO'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{status.desc}</p>
              
              {currentLocation && (
                <div className="mt-3 pt-3 border-t border-slate-800/50 flex justify-between items-center text-[10px] font-mono text-slate-500">
                  <span>LAT: {currentLocation.latitude.toFixed(5)}</span>
                  <span>LNG: {currentLocation.longitude.toFixed(5)}</span>
                </div>
              )}
            </div>

            {/* LAST ALARM FIRED SUMMARY */}
            <div className="bg-slate-800/40 border border-slate-800 rounded-3xl p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Bell className="h-4 w-4 text-amber-500" />
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Último Alerta Disparado</h3>
              </div>
              
              {lastAlert ? (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex justify-between items-center gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="font-bold text-white text-xs truncate leading-snug">{lastAlert.bridgeName}</p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Disparado às {lastAlert.timestamp} • Aproximação de {formatDistance(lastAlert.distancia)}
                    </p>
                  </div>
                  <div className="shrink-0 text-center bg-red-500/15 border border-red-500/20 text-red-400 px-2.5 py-1.5 rounded-xl font-mono">
                    <span className="text-[9px] block uppercase font-bold text-slate-500 leading-none">Limite</span>
                    <span className="text-sm font-black">{lastAlert.altura_ponte.toFixed(1)}m</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Nenhum alerta foi disparado até ao momento nesta sessão.</p>
              )}
            </div>

            {/* SAFETY AND PRIVACY DISCLAIMERS */}
            <div className="border border-slate-800/80 bg-slate-950/20 p-4 rounded-3xl space-y-2.5 text-[11px] text-slate-400 leading-relaxed">
              <div className="flex gap-2">
                <ShieldCheck className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-300">Responsabilidade (Aviso):</strong> Este aplicativo é apenas uma ferramenta auxiliar. O motorista continua inteiramente responsável por observar e respeitar a sinalização real na estrada (Requirement 11).
                </p>
              </div>
              <div className="flex gap-2 border-t border-slate-800/50 pt-2.5">
                <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-300">Privacidade Absoluta:</strong> A sua localização GPS e dados não são enviados para qualquer servidor externo. Toda a informação é tratada e guardada localmente no seu telemóvel (Requirement 14).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* BOLINHA 3: CONFIGURAÇÕES, BANCO DE PONTES & OUTROS ADMINISTRATIVOS */}
        {activeTab === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* CONFIGURAÇÕES RÁPIDAS (Sons e Temas) + CONFIG DO VEÍCULO */}
            <div className="bg-slate-800/40 border border-slate-800 rounded-3xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Settings className="h-4 w-4 text-blue-500" />
                Configurações da Cabine
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Theme Switcher Button */}
                <button
                  onClick={() => {
                    setThemeSetting((prev) => {
                      let next: 'auto' | 'light' | 'dark' = 'auto';
                      if (prev === 'auto') {
                        next = 'light';
                        setToast({ message: 'Tema Claro Ativado (Dia)', type: 'info' });
                      } else if (prev === 'light') {
                        next = 'dark';
                        setToast({ message: 'Tema Escuro Ativado (Noite - Alto Contraste)', type: 'info' });
                      } else {
                        next = 'auto';
                        const hour = new Date().getHours();
                        const isNight = hour >= 19 || hour < 7;
                        setToast({ 
                          message: `Tema Automático Ativado (${isNight ? 'Modo Noturno' : 'Modo Diurno'} ativo)`, 
                          type: 'info' 
                        });
                      }
                      return next;
                    });
                  }}
                  className="h-16 bg-slate-800 hover:bg-slate-750 active:bg-slate-850 border border-slate-700 text-slate-100 text-xs font-bold rounded-2xl flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer shadow-sm"
                  id="btn-inline-toggle-theme"
                  title="Configuração do tema visual"
                >
                  <div className="flex items-center gap-1.5">
                    {themeSetting === 'auto' ? (
                      <SunMoon className="h-4 w-4 text-blue-400" />
                    ) : themeSetting === 'light' ? (
                      <Sun className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Moon className="h-4 w-4 text-yellow-300" />
                    )}
                    <span>Tema: {themeSetting === 'auto' ? 'Auto' : themeSetting === 'light' ? 'Claro' : 'Escuro'}</span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-medium">Toque para alternar</span>
                </button>

                {/* Sound Switcher Button */}
                <button
                  onClick={() => {
                    setIsSoundMuted(!isSoundMuted);
                    setToast({ message: isSoundMuted ? 'Sons de Alerta Ativados' : 'Sons de Alerta Silenciados', type: 'info' });
                  }}
                  className={`h-16 border text-xs font-bold rounded-2xl flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer shadow-sm ${
                    isSoundMuted 
                      ? 'bg-red-950/30 border-red-500/30 text-red-400 hover:bg-red-950/40' 
                      : 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-750'
                  }`}
                  id="btn-inline-toggle-sound"
                  title="Configuração do alerta sonoro"
                >
                  <div className="flex items-center gap-1.5">
                    {isSoundMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
                    <span>Sons: {isSoundMuted ? 'Mudo' : 'Ativos'}</span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-medium">Toque para silenciar</span>
                </button>

                {/* Add Bridge Toggle Button */}
                <button
                  onClick={() => {
                    setIsAddBridgeButtonEnabled(!isAddBridgeButtonEnabled);
                    setToast({
                      message: !isAddBridgeButtonEnabled ? 'Botão "Adicionar Ponte" Ativado' : 'Botão "Adicionar Ponte" Desativado',
                      type: 'info'
                    });
                  }}
                  className={`col-span-2 h-16 border text-xs font-bold rounded-2xl flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer shadow-sm ${
                    isAddBridgeButtonEnabled
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/40'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'
                  }`}
                  id="btn-toggle-add-bridge-button"
                  title="Ativar/Desativar botão Adicionar Ponte"
                >
                  <div className="flex items-center gap-1.5">
                    <PlusCircle className={`h-4 w-4 ${isAddBridgeButtonEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Botão "Adicionar Ponte": {isAddBridgeButtonEnabled ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-medium">Toque para alternar visibilidade no mapa</span>
                </button>
              </div>

              {/* Botão para Configuração Detalhada do Veículo */}
              <button
                onClick={() => setShowConfigModal(true)}
                className="w-full h-14 bg-slate-800 hover:bg-slate-750 active:bg-slate-850 border border-slate-700 text-slate-100 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                id="btn-inline-open-config"
              >
                <Truck className="h-5 w-5 text-red-500 shrink-0" />
                <div className="text-left">
                  <p className="font-extrabold text-xs">Perfil do Veículo</p>
                  <p className="text-[10px] text-slate-400 font-medium font-mono">
                    {vehicleConfig.configurado ? `${vehicleConfig.apelido_veiculo || 'Camião'} (${vehicleConfig.altura_veiculo.toFixed(2)}m)` : 'Toque para configurar'}
                  </p>
                </div>
              </button>
            </div>

            {/* BANCO DE PONTES */}
            <div className="bg-slate-800/40 border border-slate-800 rounded-3xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="h-4 w-4 text-red-500" />
                Banco de Pontes
              </h3>
              
              <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/60 p-4 rounded-2xl">
                <div className="space-y-0.5">
                  <p className="text-xs text-slate-400">Pontes salvas localmente</p>
                  <p className="text-xl font-black text-slate-100 font-mono">{bridges.length} pontes</p>
                </div>
                <button
                  onClick={() => setShowBridgesList(true)}
                  className="h-11 px-5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  id="btn-dashboard-list-bridges-inline"
                >
                  <List className="h-4 w-4 text-white shrink-0" />
                  <span>Gerir Banco</span>
                </button>
              </div>
            </div>

            {/* OUTRAS OPÇÕES ADMINISTRATIVAS (Importar/Exportar e OSM) */}
            <div className="bg-slate-800/40 border border-slate-800 rounded-3xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-500" />
                Opções Administrativas
              </h3>

              {/* AUTOMATIC OSM / OVERPASS IMPORTER */}
              <div className="space-y-3 pb-2 border-b border-slate-800/60">
                <p className="text-[11px] text-slate-400 leading-normal">
                  Cadastre automaticamente no mapa todas as pontes com restrição de altura máxima <strong className="text-slate-300">&le; 4.0m</strong> dentro do raio de cobertura selecionado (<strong className="text-slate-300">{vehicleConfig.raio_captura_pontes || 50} milhas</strong>) a partir de onde se encontra atualmente.
                </p>

                {osmImportingStatus && (
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 space-y-1 text-[10px] font-mono text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                      <span className="text-slate-200 font-semibold truncate">{osmImportingStatus}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleImportFromOSM}
                  disabled={isOsmImporting}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer border border-emerald-500/20 shadow"
                  id="btn-import-osm"
                >
                  <Radio className="h-4 w-4 shrink-0" />
                  <span>{isOsmImporting ? 'A Importar de Overpass...' : 'Importar Pontes no meu Raio (OSM)'}</span>
                </button>
              </div>

              {/* BACKUP & COMPARTILHAMENTO */}
              <div className="space-y-3 pt-2">
                <p className="text-[11px] text-slate-400 leading-normal">
                  Exporte o seu backup local ou importe um ficheiro JSON com uma lista personalizada de pontes.
                </p>
                <DataExportImport
                  bridges={bridges}
                  onImportSuccess={handleImportBridgesList}
                />
              </div>
            </div>
          </div>
        )}

      </main>

      {/* --- FLOATING OVERLAYS & MODALS --- */}

      {/* Active High-Risk Alert Emergency Overlay (Requirement 6) */}
      {activeAlert && (
        <AlertOverlay
          bridge={activeAlert.bridge}
          distancia={activeAlert.distancia}
          vehicleHeight={activeAlert.vehicleHeight}
          onDismiss={handleDismissAlert}
          alertType={activeAlert.alertType || 'danger'}
          isMuted={isSoundMuted}
        />
      )}

      {/* Configuration Modal (Requirement 2) */}
      {showConfigModal && (
        <ConfigurationModal
          currentConfig={vehicleConfig}
          onSave={setVehicleConfig}
          onClose={() => setShowConfigModal(false)}
          forceShow={!vehicleConfig.configurado}
        />
      )}

      {/* Add / Edit Bridge Form Modal (Requirement 7 & 8) */}
      {showAddBridgeForm && (
        <BridgeForm
          onSave={handleSaveBridge}
          onUpdateExisting={handleUpdateExistingBridgeInfo}
          onClose={() => {
            setShowAddBridgeForm(false);
            setEditingBridge(null);
            setMapPrefilledCoords(null);
          }}
          existingBridges={bridges}
          currentLocation={currentLocation}
          editingBridge={editingBridge}
          prefilledCoordinates={mapPrefilledCoords}
          prefilledPhotoDataUrl={capturedPhotoUrl}
        />
      )}

      {/* Bridges List Modal (Requirement 8 & 9) */}
      {showBridgesList && (
        <BridgeList
          bridges={visibleBridges}
          currentLocation={currentLocation}
          vehicleHeight={vehicleConfig.altura_veiculo}
          alertRadius={vehicleConfig.raio_alerta}
          filterMode={filterMode}
          setFilterMode={setFilterMode}
          onEdit={(bridge) => {
            setEditingBridge(bridge);
            setShowAddBridgeForm(true);
          }}
          onDelete={handleDeleteBridge}
          onConfirm={handleToggleConfirmBridge}
          onClose={() => setShowBridgesList(false)}
        />
      )}

      {/* Hidden Auto-camera input for quick capturing */}
      <input
        type="file"
        id="auto-camera-input"
        accept="image/*"
        capture="environment"
        onChange={handleAutoCameraChange}
        className="hidden"
      />

    </div>
  );
}
