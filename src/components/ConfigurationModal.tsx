import React, { useState } from 'react';
import { VehicleConfig } from '../types';
import { Settings, Check, Truck, Bell, Navigation } from 'lucide-react';

interface ConfigurationModalProps {
  currentConfig: VehicleConfig;
  onSave: (config: VehicleConfig) => void;
  onClose?: () => void;
  forceShow?: boolean;
}

export default function ConfigurationModal({
  currentConfig,
  onSave,
  onClose,
  forceShow = false,
}: ConfigurationModalProps) {
  const [altura, setAltura] = useState<string>(
    currentConfig.altura_veiculo > 0 ? currentConfig.altura_veiculo.toString() : '3.8'
  );
  const [alturaMinima, setAlturaMinima] = useState<string>(() => {
    if (currentConfig.altura_minima_ponte !== undefined && currentConfig.altura_minima_ponte > 0) {
      return currentConfig.altura_minima_ponte.toString();
    }
    const val = currentConfig.altura_veiculo > 0 ? (currentConfig.altura_veiculo - 0.20) : 3.6;
    return parseFloat(Math.max(0, val).toFixed(2)).toString();
  });
  const [apelido, setApelido] = useState<string>(currentConfig.apelido_veiculo || '');
  const [raio, setRaio] = useState<300 | 500 | 800>(currentConfig.raio_alerta || 500);
  const [raioCaptura, setRaioCaptura] = useState<number>(currentConfig.raio_captura_pontes || 50);
  const [error, setError] = useState<string>('');

  const handleAlturaChange = (value: string) => {
    setAltura(value);
    const num = parseFloat(value.replace(',', '.'));
    if (!isNaN(num) && num > 0.20) {
      setAlturaMinima(parseFloat((num - 0.20).toFixed(2)).toString());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const alturaNum = parseFloat(altura.replace(',', '.'));
    const minHeightNum = parseFloat(alturaMinima.replace(',', '.'));
    const finalMinHeight = isNaN(minHeightNum) ? 0 : minHeightNum;
    
    if (isNaN(alturaNum) || alturaNum <= 0) {
      setError('Por favor, insira uma altura válida maior que 0.');
      return;
    }
    if (alturaNum > 10) {
      setError('Tem a certeza? Altura máxima razoável é de 10 metros.');
      return;
    }

    setError('');
    onSave({
      altura_veiculo: alturaNum,
      apelido_veiculo: apelido.trim(),
      raio_alerta: raio,
      deposito_central: 'Localização Atual',
      raio_captura_pontes: raioCaptura,
      altura_minima_ponte: finalMinHeight,
      configurado: true,
    });
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl">
            <Truck className="h-6 w-6" id="config-truck-icon" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white font-sans">Configuração do Veículo</h2>
            <p className="text-xs text-slate-400">Defina os limites para os alertas de pontes baixas</p>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 text-sm bg-red-500/15 border border-red-500/30 text-red-400 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Altura do Veículo */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1.5 flex items-center justify-between">
              <span>Altura do Veículo (metros) <span className="text-red-500">*</span></span>
              <span className="text-xs text-slate-400 font-mono">Ex: 3.8 ou 4.2</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.1"
                placeholder="Ex: 3.80"
                value={altura}
                onChange={(e) => handleAlturaChange(e.target.value)}
                required
                className="w-full h-14 px-4 bg-slate-900 border border-slate-700 rounded-2xl text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                id="input-vehicle-height"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">metros</span>
            </div>
          </div>

          {/* Altura Mínima da Ponte */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1.5 flex items-center justify-between">
              <span>Altura Mínima das Pontes (metros)</span>
              <span className="text-xs text-slate-400 font-mono">Não carregar pontes abaixo deste limite</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 3.60"
                value={alturaMinima}
                onChange={(e) => setAlturaMinima(e.target.value)}
                className="w-full h-14 px-4 bg-slate-900 border border-slate-700 rounded-2xl text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                id="input-min-bridge-height"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">metros</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Evita importar e mostrar pontes extremamente baixas (ex: 2.0m) que não são relevantes para o seu veículo. Padrão sugerido: 20cm abaixo da van.
            </p>
          </div>

          {/* Nome / Apelido */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1.5">
              Nome / Apelido do Veículo <span className="text-xs text-slate-400">(Opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Minha Iveco, Camião Renault"
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              className="w-full h-12 px-4 bg-slate-900 border border-slate-700 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              maxLength={25}
              id="input-vehicle-nickname"
            />
          </div>

          {/* Raio do Alerta */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-slate-400" />
              Raio de Alerta Padrão
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([300, 500, 800] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRaio(r)}
                  className={`py-3 rounded-2xl font-semibold border text-sm transition-all flex flex-col items-center justify-center cursor-pointer ${
                    raio === r
                      ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                  id={`radio-raio-${r}`}
                >
                  <span className="text-base font-bold">{r}m</span>
                  <span className="text-[10px] opacity-75">raio</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Selecione a distância ideal para receber o aviso e travar o veículo a tempo.
            </p>
          </div>

          {/* Raio de Captura de Pontes */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
              <Navigation className="h-4 w-4 text-emerald-500" />
              <span>Raio de Captura de Pontes</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([50, 100, 150] as const).map((mi) => (
                <button
                  key={mi}
                  type="button"
                  onClick={() => setRaioCaptura(mi)}
                  className={`py-3 rounded-2xl font-semibold border text-sm transition-all flex flex-col items-center justify-center cursor-pointer ${
                    raioCaptura === mi
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                  id={`radio-captura-${mi}`}
                >
                  <span className="text-base font-bold">{mi} mi</span>
                  <span className="text-[10px] opacity-75">milhas</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              As pontes do OpenStreetMap serão capturadas e filtradas de forma dinâmica de acordo com a sua localização GPS atual no raio selecionado.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            {!forceShow && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white rounded-2xl font-bold text-sm transition-all cursor-pointer"
                id="btn-config-cancel"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-4 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-2xl font-extrabold text-sm transition-all shadow-xl shadow-red-600/10 flex items-center justify-center space-x-2 cursor-pointer"
              id="btn-config-save"
            >
              <Check className="h-4 w-4" />
              <span>Guardar Configurações</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
