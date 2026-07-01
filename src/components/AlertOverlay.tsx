import React, { useEffect, useState } from 'react';
import { Bridge } from '../types';
import { formatDistance } from '../utils/geo';
import { playAlarm, stopAlarm, triggerVibration } from '../utils/audio';
import { AlertTriangle, X, Maximize2, VolumeX } from 'lucide-react';

interface AlertOverlayProps {
  bridge: Bridge;
  distancia: number;
  vehicleHeight: number;
  onDismiss: () => void;
  alertType: 'danger' | 'attention';
  isMuted?: boolean;
}

export default function AlertOverlay({
  bridge,
  distancia,
  vehicleHeight,
  onDismiss,
  alertType,
  isMuted = false,
}: AlertOverlayProps) {
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);

  // Auto trigger alarm and vibration on mount, stop on unmount
  useEffect(() => {
    playAlarm(distancia, 0, alertType, isMuted);
    
    // Only vibrate for danger
    if (alertType === 'danger') {
      triggerVibration();
    }
    
    // Auto-vibrate every 3 seconds while open (only for danger alerts)
    const vibrateInterval = setInterval(() => {
      if (alertType === 'danger') {
        triggerVibration();
      }
    }, 3000);

    return () => {
      stopAlarm();
      clearInterval(vibrateInterval);
    };
  }, [bridge.id, alertType, isMuted]);

  // Dynamically update beeping frequency and level as distance decreases in real-time
  useEffect(() => {
    playAlarm(distancia, 0, alertType, isMuted);
  }, [distancia, alertType, isMuted]);

  const isDanger = alertType === 'danger';
  const hasPhoto = !!bridge.photoDataUrl;

  // Render expanded photo layout (Top 50% screen, with only height shown below it)
  if (isPhotoExpanded && hasPhoto) {
    return (
      <div 
        className="fixed inset-0 z-[2100] flex flex-col bg-slate-950 select-none animate-in fade-in duration-200"
        id="expanded-alert-photo-view"
      >
        {/* Photo Container taking 50% height */}
        <div className="relative w-full h-[50vh] bg-black flex items-center justify-center overflow-hidden border-b border-slate-900">
          <img 
            src={bridge.photoDataUrl} 
            alt="Foto expandida da ponte" 
            className="w-full h-full object-contain" 
            referrerPolicy="no-referrer"
          />
          {/* Close expanded photo button */}
          <button
            onClick={() => setIsPhotoExpanded(false)}
            className="absolute top-4 right-4 h-12 w-12 bg-slate-900/95 hover:bg-slate-800 text-white rounded-full flex items-center justify-center border border-slate-700 active:scale-95 transition-all cursor-pointer shadow-2xl"
            title="Fechar foto"
            id="btn-close-expanded-photo"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Height only below the photo */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 bg-slate-950 text-center">
          <span className="text-3xl font-black text-yellow-400 font-mono tracking-tight">
            Altura: {bridge.altura_maxima !== null ? bridge.altura_maxima.toFixed(2) + ' m' : 'Incompleta'}
          </span>
        </div>
      </div>
    );
  }

  // Regular alert compact bar (fixed at the top, below header, keeping map center completely free)
  return (
    <div 
      className={`fixed top-20 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-xl z-[2000] bg-slate-950 border-2 rounded-2xl shadow-2xl backdrop-blur-md text-white animate-in slide-in-from-top duration-300 overflow-hidden p-2.5 ${
        isDanger ? 'border-red-500 shadow-red-950/20' : 'border-amber-500 shadow-amber-950/20'
      }`}
      id="active-alert-floating-panel"
    >
      {hasPhoto ? (
        <div className="flex items-center justify-between w-full gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Miniature photo */}
            <div 
              onClick={() => setIsPhotoExpanded(true)}
              className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-slate-800 cursor-pointer hover:opacity-90 active:scale-95 transition-all shadow-md group"
              title="Tocar para ampliar foto"
              id="alert-mini-photo"
            >
              <img 
                src={bridge.photoDataUrl} 
                alt="Miniatura" 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/10 hover:bg-black/0 transition-colors" />
            </div>
            
            {/* Metrics */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-bold min-w-0">
              <span className="text-slate-300 truncate max-w-[140px] font-semibold hidden sm:inline">
                {bridge.nome}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 font-medium">Altura:</span>
                <span className={`font-black font-mono ${isDanger ? 'text-red-450 text-sm' : 'text-amber-450 text-sm'}`}>
                  {bridge.altura_maxima !== null ? bridge.altura_maxima.toFixed(2) + ' m' : 'Sem Altura'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 font-medium">Distância:</span>
                <span className="font-black font-mono text-blue-400 text-sm animate-pulse">
                  {formatDistance(distancia)}
                </span>
              </div>
            </div>
          </div>

          {/* Silence Button */}
          <button
            onClick={onDismiss}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border active:scale-95 shrink-0 flex items-center gap-1.5 ${
              isDanger 
                ? 'bg-red-950/40 hover:bg-red-600 active:bg-red-700 text-red-400 hover:text-white border-red-500/30 hover:border-red-500' 
                : 'bg-amber-950/40 hover:bg-amber-600 active:bg-amber-700 text-amber-400 hover:text-white border-amber-500/30 hover:border-amber-500'
            }`}
            id="btn-alert-dismiss"
            title="Silenciar alarme por 5 minutos"
          >
            <VolumeX className="h-3.5 w-3.5" />
            <span>Silenciar</span>
          </button>
        </div>
      ) : (
        /* Case without photo - compact layout without empty space */
        <div className="flex items-center justify-between w-full gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={`p-1.5 rounded-lg shrink-0 ${isDanger ? 'bg-red-500/10 text-red-400 animate-pulse' : 'bg-amber-500/10 text-amber-400'}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            
            <div className="flex flex-col xs:flex-row xs:items-center gap-x-3 gap-y-0.5 min-w-0">
              <span className={`text-[11px] font-black uppercase tracking-wider ${isDanger ? 'text-red-400' : 'text-amber-400'} whitespace-nowrap`}>
                ⚠️ Ponte Baixa
              </span>
              <div className="flex items-center gap-3 text-xs font-bold">
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-medium">Altura:</span>
                  <span className={`font-black font-mono ${isDanger ? 'text-red-450 text-sm' : 'text-amber-450 text-sm'}`}>
                    {bridge.altura_maxima !== null ? bridge.altura_maxima.toFixed(2) + ' m' : 'Sem Altura'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-medium">Distância:</span>
                  <span className="font-black font-mono text-blue-400 text-sm animate-pulse">
                    {formatDistance(distancia)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Silence Button */}
          <button
            onClick={onDismiss}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border active:scale-95 shrink-0 flex items-center gap-1.5 ${
              isDanger 
                ? 'bg-red-950/40 hover:bg-red-600 active:bg-red-700 text-red-400 hover:text-white border-red-500/30 hover:border-red-500' 
                : 'bg-amber-950/40 hover:bg-amber-600 active:bg-amber-700 text-amber-400 hover:text-white border-amber-500/30 hover:border-amber-500'
            }`}
            id="btn-alert-dismiss"
            title="Silenciar alarme por 5 minutos"
          >
            <VolumeX className="h-3.5 w-3.5" />
            <span>Silenciar</span>
          </button>
        </div>
      )}
    </div>
  );
}
