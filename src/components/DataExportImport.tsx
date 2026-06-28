import React, { useRef, useState } from 'react';
import { Bridge } from '../types';
import { getDistance } from '../utils/geo';
import { Download, Upload, CheckCircle2, AlertCircle, FileJson } from 'lucide-react';

interface DataExportImportProps {
  bridges: Bridge[];
  onImportSuccess: (importedBridges: Bridge[]) => void;
}

export default function DataExportImport({
  bridges,
  onImportSuccess,
}: DataExportImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Export to JSON
  const handleExport = () => {
    try {
      const dataStr = JSON.stringify(bridges, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `pontes_baixas_low_bridge_alert_${new Date().toISOString().slice(0, 10)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      setStatusMessage({
        type: 'success',
        text: 'Dados exportados com sucesso! Guarde o ficheiro JSON.'
      });
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (error) {
      console.error(error);
      setStatusMessage({
        type: 'error',
        text: 'Falha ao exportar os dados.'
      });
    }
  };

  // Trigger File Picker
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Handle File Import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        
        if (!Array.isArray(parsed)) {
          throw new Error('O ficheiro JSON deve conter uma lista de pontes.');
        }

        // Validate structure of imported bridges
        const validBridges: Bridge[] = [];
        let invalidCount = 0;

        parsed.forEach((item: any) => {
          if (
            item &&
            typeof item.nome === 'string' &&
            typeof item.latitude === 'number' &&
            typeof item.longitude === 'number' &&
            typeof item.altura_maxima === 'number'
          ) {
            // Reconstruct a clean Bridge object
            validBridges.push({
              id: item.id || `imported-${Math.random().toString(36).substr(2, 9)}`,
              nome: item.nome,
              latitude: item.latitude,
              longitude: item.longitude,
              altura_maxima: item.altura_maxima,
              notas: item.notas || '',
              data_criacao: item.data_criacao || new Date().toISOString(),
              origem: item.origem || 'motorista',
              confirmada: item.confirmada || false,
            });
          } else {
            invalidCount++;
          }
        });

        if (validBridges.length === 0) {
          setStatusMessage({
            type: 'error',
            text: 'Nenhum dado válido de ponte encontrado no ficheiro JSON.'
          });
          return;
        }

        // Merge logic: avoid duplicates (within 30 meters or matching ID)
        const updatedList = [...bridges];
        let addedCount = 0;
        let skippedCount = 0;

        validBridges.forEach((newBridge) => {
          // Check if same ID already exists
          const idExists = bridges.some((b) => b.id === newBridge.id);
          
          // Check if coordinates already exist within 30 meters
          const proximityExists = bridges.some((b) => {
            const dist = getDistance(newBridge.latitude, newBridge.longitude, b.latitude, b.longitude);
            return dist <= 30;
          });

          if (idExists || proximityExists) {
            skippedCount++;
          } else {
            updatedList.push(newBridge);
            addedCount++;
          }
        });

        onImportSuccess(updatedList);

        setStatusMessage({
          type: 'success',
          text: `Importação concluída: ${addedCount} novas pontes adicionadas. ${skippedCount} ignoradas por proximidade/ID duplicado.${
            invalidCount > 0 ? ` ${invalidCount} registros inválidos rejeitados.` : ''
          }`
        });
        
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => setStatusMessage(null), 7000);

      } catch (err: any) {
        console.error(err);
        setStatusMessage({
          type: 'error',
          text: 'Ficheiro JSON corrompido ou formato inválido.'
        });
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5 shadow-lg space-y-4">
      <div className="flex items-center space-x-2.5">
        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
          <FileJson className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Partilhar Dados (Importar/Exportar)</h3>
          <p className="text-[10px] text-slate-400">Partilhe bases de dados locais com outros motoristas</p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/15 border-red-500/30 text-red-400'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Export Button */}
        <button
          onClick={handleExport}
          className="h-11 bg-slate-700 hover:bg-slate-650 text-slate-100 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer border border-slate-600"
          id="btn-export-data"
        >
          <Download className="h-4 w-4" />
          <span>Exportar Dados</span>
        </button>

        {/* Import Button */}
        <button
          onClick={handleImportClick}
          className="h-11 bg-slate-700 hover:bg-slate-650 text-slate-100 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer border border-slate-600"
          id="btn-import-data"
        >
          <Upload className="h-4 w-4" />
          <span>Importar Dados</span>
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
        id="import-file-input"
      />
    </div>
  );
}
