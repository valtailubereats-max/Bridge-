import React, { useState, useEffect, useRef } from 'react';
import { Bridge, Coordinates } from '../types';
import { getDistance } from '../utils/geo';
import { MapPin, Save, X, Navigation, AlertTriangle, Camera, Trash2, Image as ImageIcon, HelpCircle } from 'lucide-react';

interface BridgeFormProps {
  onSave: (bridge: Partial<Bridge> & {
    nome: string;
    latitude: number;
    longitude: number;
    altura_maxima: number;
    notas: string;
    photoDataUrl?: string;
  }) => void;
  onUpdateExisting: (id: string, altura: number, notas: string, photoDataUrl?: string) => void;
  onClose: () => void;
  existingBridges: Bridge[];
  currentLocation: Coordinates | null;
  editingBridge?: Bridge | null;
  prefilledCoordinates?: Coordinates | null;
  prefilledPhotoDataUrl?: string;
}

export default function BridgeForm({
  onSave,
  onUpdateExisting,
  onClose,
  existingBridges,
  currentLocation,
  editingBridge = null,
  prefilledCoordinates = null,
  prefilledPhotoDataUrl = '',
}: BridgeFormProps) {
  const [nome, setNome] = useState(editingBridge?.nome || '');
  const [altura, setAltura] = useState(editingBridge && editingBridge.altura_maxima !== null ? editingBridge.altura_maxima.toString() : '');
  const [latitude, setLatitude] = useState(
    editingBridge 
      ? editingBridge.latitude.toString() 
      : (prefilledCoordinates ? prefilledCoordinates.latitude.toString() : '')
  );
  const [longitude, setLongitude] = useState(
    editingBridge 
      ? editingBridge.longitude.toString() 
      : (prefilledCoordinates ? prefilledCoordinates.longitude.toString() : '')
  );
  const [notas, setNotas] = useState(editingBridge?.notas || '');
  const [photoDataUrl, setPhotoDataUrl] = useState<string>(editingBridge?.photoDataUrl || prefilledPhotoDataUrl || '');
  
  const [fetchingGps, setFetchingGps] = useState(false);
  const [gpsError, setGpsError] = useState('');
  
  // Duplication warning modal state
  const [duplicateBridge, setDuplicateBridge] = useState<Bridge | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingBridge) {
      setNome(editingBridge.nome);
      setAltura(editingBridge.altura_maxima !== null ? editingBridge.altura_maxima.toString() : '');
      setLatitude(editingBridge.latitude.toString());
      setLongitude(editingBridge.longitude.toString());
      setNotas(editingBridge.notas);
      setPhotoDataUrl(editingBridge.photoDataUrl || '');
    } else if (prefilledCoordinates) {
      setLatitude(prefilledCoordinates.latitude.toString());
      setLongitude(prefilledCoordinates.longitude.toString());
      if (prefilledPhotoDataUrl) {
        setPhotoDataUrl(prefilledPhotoDataUrl);
      }
    }
  }, [editingBridge, prefilledCoordinates, prefilledPhotoDataUrl]);

  const handleGetCurrentLocation = () => {
    setFetchingGps(true);
    setGpsError('');
    
    if (!navigator.geolocation) {
      setGpsError('O seu dispositivo não suporta Geolocalização.');
      setFetchingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setFetchingGps(false);
      },
      (error) => {
        console.warn('[GPS] Form status warning:', error.code, error.message);
        setGpsError('Não foi possível obter a localização. Ative o GPS nas definições.');
        setFetchingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoDataUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleRemovePhoto = () => {
    setPhotoDataUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const executeSave = (bypassDuplicateCheck = false) => {
    const latNum = parseFloat(latitude.replace(',', '.'));
    const lonNum = parseFloat(longitude.replace(',', '.'));
    const altNum = parseFloat(altura.replace(',', '.'));

    if (isNaN(latNum) || isNaN(lonNum)) {
      alert('Por favor, insira coordenadas de Latitude e Longitude válidas.');
      return;
    }

    if (isNaN(altNum) || altNum <= 0) {
      alert('Por favor, insira uma altura máxima válida maior que zero.');
      return;
    }

    // Check duplicate rule: Only if NOT editing an existing bridge in edit mode and check wasn't bypassed
    if (!editingBridge && !bypassDuplicateCheck) {
      const nearBridge = existingBridges.find(b => {
        const dist = getDistance(latNum, lonNum, b.latitude, b.longitude);
        return dist <= 30; // 30 meters threshold
      });

      if (nearBridge) {
        setDuplicateBridge(nearBridge);
        setShowDuplicateDialog(true);
        return;
      }
    }

    // Save normally
    onSave({
      id: editingBridge?.id,
      nome: nome.trim() || `Ponte na Latitude ${latNum.toFixed(4)}`,
      latitude: latNum,
      longitude: lonNum,
      altura_maxima: altNum,
      notas: notas.trim(),
      origem: editingBridge?.origem || 'motorista',
      confirmada: editingBridge?.confirmada || false,
      photoDataUrl: photoDataUrl || undefined,
      source: editingBridge?.source || 'driver',
      reportsCount: editingBridge?.reportsCount || 1,
      reportedHeights: editingBridge?.reportedHeights || [altNum]
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSave(false);
  };

  // Duplicate Dialog Actions
  const handleIgnore = () => {
    setShowDuplicateDialog(false);
    onClose();
  };

  const handleUpdateDuplicate = () => {
    if (duplicateBridge) {
      const altNum = parseFloat(altura.replace(',', '.'));
      onUpdateExisting(duplicateBridge.id, altNum, notas.trim(), photoDataUrl || undefined);
    }
    setShowDuplicateDialog(false);
    onClose();
  };

  const handleSaveAnyway = () => {
    executeSave(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
        
        {/* Header */}
        <div className="px-6 py-5 bg-slate-800/50 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-red-500/10 text-red-500 rounded-xl">
              <MapPin className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 font-sans">
              {editingBridge ? 'Editar Ponte Baixa' : 'Cadastrar Ponte Baixa'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700/50 rounded-xl text-slate-400 hover:text-slate-100 transition-all cursor-pointer"
            id="btn-close-form"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Geolocation Fetch Button (Only for adding new) */}
          {!editingBridge && (
            <div>
              <button
                type="button"
                onClick={handleGetCurrentLocation}
                disabled={fetchingGps}
                className="w-full h-12 bg-slate-900 border border-slate-700 hover:bg-slate-850 disabled:bg-slate-800 text-slate-100 font-bold rounded-2xl flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-sm"
                id="btn-form-gps"
              >
                <Navigation className={`h-4 w-4 ${fetchingGps ? 'animate-spin text-red-400' : ''}`} />
                <span>{fetchingGps ? 'A obter coordenadas GPS...' : 'Usar minha localização atual'}</span>
              </button>
              {gpsError && (
                <p className="text-xs text-amber-400 mt-1.5 font-sans">{gpsError}</p>
              )}
            </div>
          )}

          {/* Latitude & Longitude Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Latitude <span className="text-red-500">*</span></label>
              <input
                type="number"
                step="0.000001"
                placeholder="Ex: 50.8036"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                required
                className="w-full h-11 px-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm font-mono"
                id="form-lat"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Longitude <span className="text-red-500">*</span></label>
              <input
                type="number"
                step="0.000001"
                placeholder="Ex: -1.0756"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                required
                className="w-full h-11 px-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm font-mono"
                id="form-lng"
              />
            </div>
          </div>

          {/* Altura Máxima */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Altura Máxima Permitida (metros) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                placeholder="Ex: 3.50"
                value={altura}
                onChange={(e) => setAltura(e.target.value)}
                required
                className="w-full h-12 px-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 font-bold text-base focus:outline-none focus:ring-2 focus:ring-red-500"
                id="form-height"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">m</span>
            </div>
          </div>

          {/* Nome da Ponte */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Nome da Ponte / Identificação <span className="text-slate-500">(Opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Viaduto Ferroviário de Portsmouth"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full h-11 px-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 text-sm"
              id="form-name"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Notas / Observações <span className="text-slate-500">(Opcional)</span>
            </label>
            <textarea
              placeholder="Ex: Altura sinalizada incorretamente, fiação baixa antes da ponte, etc."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              id="form-notes"
            />
          </div>

          {/* Opcional: Anexar / Tirar Foto (Requirement 1) */}
          <div className="bg-slate-900/40 border border-slate-700/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="block text-xs font-bold text-slate-300">Fotografia da Ponte / Sinal</span>
                <span className="text-[10px] text-slate-400">Anexe uma imagem do local ou da placa de altura</span>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-medium">Opcional</span>
            </div>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              ref={fileInputRef}
              className="hidden"
              id="bridge-photo-input"
            />

            {!photoDataUrl ? (
              <button
                type="button"
                onClick={triggerFileInput}
                className="w-full h-16 border-2 border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-800/40 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                id="btn-trigger-photo"
              >
                <Camera className="h-5 w-5 mb-1 text-slate-500" />
                <span className="text-xs font-bold">Tirar Foto ou Carregar</span>
              </button>
            ) : (
              <div className="relative flex items-center gap-3 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800 animate-in fade-in duration-100">
                <div className="h-14 w-14 rounded-lg bg-slate-900 overflow-hidden border border-slate-700 flex-shrink-0">
                  <img src={photoDataUrl} alt="Preview da ponte" className="h-full w-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-400 truncate">Imagem anexada com sucesso</p>
                  <p className="text-xs font-bold text-emerald-400">Pronta para salvar localmente</p>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="p-2 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition-all cursor-pointer flex-shrink-0"
                  id="btn-remove-photo"
                  title="Remover foto anexada"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Submit Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-sm cursor-pointer"
              id="btn-form-cancel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-xl text-sm flex items-center justify-center space-x-2 shadow-lg shadow-red-600/10 cursor-pointer"
              id="btn-form-save"
            >
              <Save className="h-4 w-4" />
              <span>{editingBridge ? 'Atualizar Ponte' : 'Salvar Ponte'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Duplicate Dialog Warning */}
      {showDuplicateDialog && duplicateBridge && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-850 border border-slate-700 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="mx-auto p-3 bg-amber-500/15 text-amber-500 rounded-full w-12 h-12 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6" />
            </div>
            
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-white font-sans">Ponte Próxima Detectada</h4>
              <p className="text-xs text-slate-300 px-2 leading-relaxed">
                Esta ponte parece já existir no sistema (encontra-se a menos de 30 metros da sua localização).
              </p>
            </div>

            <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-800 text-left space-y-1.5 text-xs">
              <p className="text-slate-400 font-semibold uppercase tracking-wider text-[9px]">Ponte Encontrada:</p>
              <p className="font-bold text-white truncate">{duplicateBridge.nome}</p>
              <div className="flex justify-between text-slate-400">
                <span>Altura Registrada: <strong className="text-amber-400">{duplicateBridge.altura_maxima}m</strong></span>
                <span>Nova Altura Proposta: <strong className="text-red-400">{parseFloat(altura || '0')}m</strong></span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleUpdateDuplicate}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
                id="btn-dup-update"
              >
                Atualizar Altura do Registro Existente
              </button>

              {/* Requirement: Allow saving anyway as a new report to trigger conflict / groupings */}
              <button
                type="button"
                onClick={handleSaveAnyway}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
                id="btn-dup-save-anyway"
                title="Cria um relato sobreposto que será agrupado, permitindo testar a disputa de altura"
              >
                Registrar como Novo Relato (Cria Disputa)
              </button>
              
              <button
                type="button"
                onClick={handleIgnore}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl text-xs transition-all cursor-pointer"
                id="btn-dup-ignore"
              >
                Ignorar (Não cadastrar)
              </button>
              
              <button
                type="button"
                onClick={() => setShowDuplicateDialog(false)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-750 text-slate-400 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                id="btn-dup-cancel"
              >
                Voltar ao Formulário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
