import React, { useEffect } from 'react';
import { Bridge } from '../types';
import { formatDistance, getGoogleMapsDirectionUrl } from '../utils/geo';
import { playAlarm, stopAlarm, triggerVibration } from '../utils/audio';
import { AlertTriangle, Map, ShieldAlert } from 'lucide-react';

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
  
  // Auto trigger alarm and vibration on mount, stop on unmount
  useEffect(() => {
    playAlarm(distancia, 0, alertType, isMuted);
    
    // Only vibrate for danger or very briefly for attention
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

  return (
    <div 
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-slate-900/95 border-2 rounded-3xl p-4 shadow-2xl space-y-3 backdrop-blur-md text-white animate-in slide-in-from-bottom duration-300 ${
        isDanger ? 'border-red-500' : 'border-amber-500'
      }`}
      id="active-alert-floating-panel"
    >
      {/* Warning Header */}
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl animate-pulse ${isDanger ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
          <AlertTriangle className={`h-5 w-5 ${isDanger ? 'text-red-500' : 'text-amber-500'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className={`text-sm font-black tracking-wider uppercase ${isDanger ? 'text-red-400' : 'text-amber-400'}`}>
            {isDanger ? '⚠️ Perigo: Ponte Baixa!' : '⚠️ Atenção: Ponte Baixa'}
          </h2>
          <p className="text-[11px] text-slate-300 font-bold truncate">
            {bridge.nome}
          </p>
        </div>
      </div>

      {/* Message Info */}
      <p className="text-[10px] text-slate-400 leading-normal">
        {bridge.altura_maxima === null
          ? 'Ponte cadastrada sem altura confirmada. Redobre a atenção!'
          : (isDanger 
              ? 'ESTA PONTE É MAIS BAIXA QUE O SEU VEÍCULO! Perigo de colisão.' 
              : 'Ponte com restrição de altura próxima, mas acima do limite do seu veículo.')
        }
      </p>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
          <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Distância</span>
          <span className={`text-sm font-black font-mono ${isDanger ? 'text-red-400' : 'text-amber-400'}`}>{formatDistance(distancia)}</span>
        </div>
        <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800 flex flex-col justify-center">
          <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Limite / Veículo</span>
          <span className="text-sm font-black text-yellow-400 font-mono">
            {bridge.altura_maxima !== null ? bridge.altura_maxima.toFixed(2) + 'm' : 'S/ Altura'} <span className="text-slate-400 font-normal">vs</span> {vehicleHeight.toFixed(2)}m
          </span>
        </div>
      </div>

      {/* Buttons Row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onDismiss}
          className={`h-11 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer shadow-lg border ${
            isDanger 
              ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-red-600/10 border-red-500/20' 
              : 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white shadow-amber-600/10 border-amber-500/20'
          }`}
          id="btn-alert-dismiss"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Silenciar (5 min)</span>
        </button>

        <a
          href={getGoogleMapsDirectionUrl(bridge.latitude, bridge.longitude)}
          target="_blank"
          rel="noreferrer"
          className="h-11 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer shadow-lg shadow-blue-600/10 border border-blue-500/20"
          id="btn-alert-maps"
        >
          <Map className="h-4 w-4 shrink-0" />
          <span>Ver Rota</span>
        </a>
      </div>
    </div>
  );
}
