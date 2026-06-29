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
        className="fixed inset-0 z-[2100] flex flex-col bg-slate-950/98 select-none animate-in fade-in duration-200"
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
            className="absolute top-4 right-4 h-12 w-12 bg-slate-900/90 hover:bg-slate-800 text-white rounded-full flex items-center justify-center border border-slate-700 active:scale-95 transition-all cursor-pointer shadow-2xl"
            title="Fechar foto"
            id="btn-close-expanded-photo"
          >
            <X className="h-6 w-6" />
          </button>
          <span className="absolute bottom-3 left-4 bg-slate-900/80 text-[10px] font-black text-slate-300 px-3 py-1 rounded-full border border-slate-800 uppercase tracking-wider">
            Foto Expandida
          </span>
        </div>

        {/* Height only below the photo */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 text-center space-y-4">
          <div className="space-y-1">
            <span className="text-xs uppercase font-black tracking-wider text-slate-400 block">Altura Máxima</span>
            <span className="text-6xl font-black text-yellow-400 font-mono tracking-tight">
              {bridge.altura_maxima !== null ? bridge.altura_maxima.toFixed(2) + 'm' : 'Sem Altura'}
            </span>
          </div>

          <button
            onClick={() => setIsPhotoExpanded(false)}
            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-800 cursor-pointer active:scale-95 shadow-lg"
            id="btn-back-to-alert-panel"
          >
            Voltar ao Alerta
          </button>
        </div>
      </div>
    );
  }

  // Regular alert popup (independent simpler overlay for situation 2)
  return (
    <div 
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[2000] bg-slate-950 border-2 rounded-3xl shadow-2xl backdrop-blur-md text-white animate-in slide-in-from-bottom duration-300 overflow-hidden ${
        isDanger ? 'border-red-500 shadow-red-950/20' : 'border-amber-500 shadow-amber-950/20'
      }`}
      id="active-alert-floating-panel"
    >
      {/* 1. If Photo Exists: Photo at the TOP (Max visual priority) */}
      {hasPhoto ? (
        <div className="relative w-full h-52 bg-slate-950 overflow-hidden" id="alert-photo-top-section">
          <img 
            src={bridge.photoDataUrl} 
            alt="Foto da ponte baixa" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          {/* Gradient overlay for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
          
          {/* Close button inside image */}
          <button 
            onClick={onDismiss}
            className="absolute top-3 right-3 h-8 w-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer border border-white/10"
            title="Silenciar alerta"
            id="btn-close-alert-top-img"
          >
            <X className="h-4.5 w-4.5" />
          </button>

          {/* Quick Double-Tap Instruction and Expand Trigger Overlay */}
          <button
            onClick={() => setIsPhotoExpanded(true)}
            className="absolute bottom-3 left-3 bg-black/70 hover:bg-black/90 text-[10px] font-black text-slate-200 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            id="btn-trigger-photo-expand"
          >
            <Maximize2 className="h-3.5 w-3.5 text-blue-400" />
            <span>AMPLIAR FOTO</span>
          </button>
        </div>
      ) : (
        /* If no photo: Elegant warning header (No empty space or placeholders) */
        <div className="p-4 flex items-center justify-between border-b border-slate-900 bg-gradient-to-r from-slate-950 to-slate-900">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${isDanger ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-amber-500/20 text-amber-400'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="text-left">
              <h2 className={`text-sm font-black uppercase tracking-wider leading-none ${isDanger ? 'text-red-400' : 'text-amber-400'}`}>
                {isDanger ? '⚠️ Ponte Baixa' : '⚠️ Ponte Baixa'}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold truncate max-w-[180px] mt-1">{bridge.nome}</p>
            </div>
          </div>
          <button 
            onClick={onDismiss}
            className="text-slate-400 hover:text-white hover:bg-slate-900 p-1.5 rounded-lg transition-colors cursor-pointer"
            title="Silenciar alerta"
            id="btn-close-alert-no-img"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      )}

      {/* 2. Primary Metrics (Height & Distance) */}
      <div className="p-4 space-y-4">
        {hasPhoto && (
          <div className="text-left">
            <h2 className={`text-xs font-black uppercase tracking-wider leading-none ${isDanger ? 'text-red-400' : 'text-amber-400'}`}>
              {isDanger ? '⚠️ Perigo: Ponte Baixa' : '⚠️ Atenção: Ponte Baixa'}
            </h2>
            <p className="text-[10px] text-slate-400 font-bold truncate mt-1">{bridge.nome}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-center">
          {/* Height card (Visual Focus 1) */}
          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 flex flex-col justify-center items-center" id="alert-height-card">
            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Altura</span>
            <span className={`text-3xl font-extrabold font-mono mt-1 leading-none ${isDanger ? 'text-red-400' : 'text-amber-400'}`}>
              {bridge.altura_maxima !== null ? bridge.altura_maxima.toFixed(2) + 'm' : 'Sem Altura'}
            </span>
          </div>

          {/* Distance card (Visual Focus 2, updates dynamically in real-time) */}
          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 flex flex-col justify-center items-center" id="alert-distance-card">
            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Distância</span>
            <span className="text-3xl font-extrabold font-mono mt-1 leading-none text-blue-400 animate-pulse">
              {formatDistance(distancia)}
            </span>
          </div>
        </div>

        {/* Action Button: Silenciar Alarme */}
        <button
          onClick={onDismiss}
          className={`w-full h-12 font-black text-xs rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg border active:scale-95 ${
            isDanger 
              ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white border-red-500/20' 
              : 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white border-amber-500/20'
          }`}
          id="btn-alert-dismiss"
        >
          <VolumeX className="h-4.5 w-4.5 shrink-0" />
          <span>Silenciar Alarme (5 min)</span>
        </button>
      </div>
    </div>
  );
}
