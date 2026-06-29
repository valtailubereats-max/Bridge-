import React, { useState, useEffect } from 'react';
import { Bridge, Coordinates, ConfidenceStatus } from '../types';
import { getDistance, formatDistance, getGoogleMapsDirectionUrl } from '../utils/geo';
import { getGroupedBridges, getConfidenceStatusLabel, BridgeGroup } from '../utils/bridgeGroup';
import { Search, Map, CheckCircle2, Edit3, Trash2, MapPin, AlertCircle, Info, Check, Filter, Image as ImageIcon, Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react';

interface BridgeListProps {
  bridges: Bridge[];
  currentLocation: Coordinates | null;
  vehicleHeight: number;
  alertRadius: number;
  filterMode: 'all' | 'restricted' | 'nearby';
  setFilterMode: (mode: 'all' | 'restricted' | 'nearby') => void;
  onEdit: (bridge: Bridge) => void;
  onDelete: (id: string) => void;
  onConfirm: (id: string, confirmed: boolean) => void;
  onClose: () => void;
}

export default function BridgeList({
  bridges,
  currentLocation,
  vehicleHeight,
  alertRadius,
  filterMode,
  setFilterMode,
  onEdit,
  onDelete,
  onConfirm,
  onClose,
}: BridgeListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Clear any states that might restrict results when active filter changes
  useEffect(() => {
    setSearchTerm('');
    setExpandedGroupId(null);
  }, [filterMode]);

  // Helper to calculate distance to group primary bridge
  const getGroupDistance = (group: BridgeGroup) => {
    if (!currentLocation) return null;
    return getDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      group.primaryBridge.latitude,
      group.primaryBridge.longitude
    );
  };

  // Group all bridges
  const groupedList = getGroupedBridges(bridges);

  // Reference coordinate calculation for counting
  const refLat = currentLocation ? currentLocation.latitude : 50.803600;
  const refLng = currentLocation ? currentLocation.longitude : -1.075600;

  // Calculate counts for the buttons based on the FULL original list:
  const countAll = groupedList.length;
  const countRestricted = groupedList.filter(g => g.altura_maxima !== null && g.altura_maxima <= vehicleHeight).length;
  const countNearby = groupedList.filter(g => {
    const dist = getDistance(refLat, refLng, g.primaryBridge.latitude, g.primaryBridge.longitude);
    return dist <= alertRadius;
  }).length;

  // Process and filter groups
  const processedGroups = groupedList
    .map((group) => {
      const distance = getGroupDistance(group);
      return { ...group, distance };
    })
    .filter((group) => {
      // 1. Filter by the main active filter Mode (always starting from original list):
      if (filterMode === 'restricted') {
        if (group.altura_maxima !== null && group.altura_maxima > vehicleHeight) return false;
      } else if (filterMode === 'nearby') {
        const dist = getDistance(refLat, refLng, group.primaryBridge.latitude, group.primaryBridge.longitude);
        if (dist > alertRadius) return false;
      }

      // 2. Search matching either the group's primary name, individual names or notes
      const matchesSearch =
        group.primaryBridge.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.notesList.some(note => note.toLowerCase().includes(searchTerm.toLowerCase())) ||
        group.bridges.some(b => b.nome.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesSearch;
    });

  // Sort: If GPS is active, sort by nearest distance first. Otherwise alphabetically.
  const sortedGroups = [...processedGroups].sort((a, b) => {
    if (a.distance !== null && b.distance !== null) {
      return a.distance - b.distance; // nearest first
    }
    return a.primaryBridge.nome.localeCompare(b.primaryBridge.nome);
  });

  const toggleExpandGroup = (groupId: string) => {
    setExpandedGroupId(expandedGroupId === groupId ? null : groupId);
  };

  const getStatusBadgeStyles = (status: ConfidenceStatus) => {
    switch (status) {
      case 'dados_em_conflito':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'confirmada_por_multiplos':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'reportada_por_1_motorista':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'nao_confirmada':
      default:
        return 'bg-slate-700/40 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900 flex flex-col h-full animate-in slide-in-from-bottom duration-300">
      
      {/* Top Navigation / Header */}
      <div className="px-6 py-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <MapPin className="h-6 w-6 text-red-500" />
          <h2 className="text-xl font-bold text-slate-100 font-sans">Banco de Pontes ({groupedList.length} locais)</h2>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-750 active:bg-slate-900 rounded-xl font-bold text-xs text-slate-200 cursor-pointer border border-slate-700"
          id="btn-close-list"
        >
          Voltar
        </button>
      </div>

      {/* Filter and Search Panel */}
      <div className="p-4 bg-slate-950/40 border-b border-slate-800 space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por nome, notas ou relatórios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-11 pl-11 pr-4 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
            id="search-bridge-input"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="text-slate-500 flex items-center gap-1 font-semibold mr-1">
            <Filter className="h-3 w-3" /> Filtro:
          </span>
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              filterMode === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            id="btn-filter-all"
          >
            Todas ({countAll})
          </button>
          <button
            onClick={() => setFilterMode('restricted')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              filterMode === 'restricted'
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            id="btn-filter-restricted"
          >
            Restritas ({countRestricted})
          </button>
          <button
            onClick={() => setFilterMode('nearby')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              filterMode === 'nearby'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            id="btn-filter-nearby"
          >
            Próximas ({countNearby})
          </button>
        </div>
      </div>

      {/* Bridges List Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/90">

        {sortedGroups.length === 0 ? (
          <div className="text-center py-12 text-slate-500 space-y-2">
            <Info className="h-10 w-10 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold">
              {filterMode === 'restricted'
                ? 'Nenhuma ponte restrita para a altura atual do veículo.'
                : 'Nenhum local encontrado.'}
            </p>
            {filterMode !== 'restricted' && (
              <p className="text-xs">Tente ajustar o termo de pesquisa ou os filtros ativos.</p>
            )}
          </div>
        ) : (
          sortedGroups.map((group) => {
            const isDanger = group.altura_maxima !== null && group.altura_maxima <= vehicleHeight;
            const isExpanded = expandedGroupId === group.id;
            
            return (
              <div
                key={group.id}
                className={`border rounded-2xl p-4 transition-all ${
                  isDanger
                    ? 'bg-red-950/15 border-red-500/40 hover:border-red-500/60'
                    : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-700'
                }`}
                id={`bridge-group-card-${group.id}`}
              >
                {/* Main Row Clickable */}
                <div
                  onClick={() => toggleExpandGroup(group.id)}
                  className="flex justify-between items-start gap-3 cursor-pointer"
                >
                  {/* Photo Thumbnail */}
                  {group.photoDataUrl && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPhoto(group.photoDataUrl || null);
                      }}
                      className="h-14 w-14 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 flex-shrink-0 relative group"
                      title="Clique para ampliar"
                    >
                      <img src={group.photoDataUrl} alt="Miniatura da ponte" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                        <ImageIcon className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${getStatusBadgeStyles(group.confidenceStatus)}`}
                      >
                        {getConfidenceStatusLabel(group.confidenceStatus)}
                      </span>

                      <span className="text-[9px] bg-slate-900 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded-md font-mono">
                        {group.reportsCount} relato(s)
                      </span>
                    </div>
                    
                    <h4 className="text-base font-bold text-white leading-snug truncate">{group.primaryBridge.nome}</h4>
                    
                    {/* Distance status */}
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-sans">
                      {group.distance !== null ? (
                        <span className="flex items-center gap-1 font-bold text-red-400 bg-red-400/5 px-2 py-0.5 rounded-lg border border-red-400/10">
                          <MapPin className="h-3 w-3" />
                          A {formatDistance(group.distance)}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">Distância indisponível (GPS inativo)</span>
                      )}
                    </div>
                  </div>

                  {/* Height Indicator Circle */}
                  <div className="text-center shrink-0">
                    <div
                      className={`h-14 w-14 rounded-full border-4 flex flex-col items-center justify-center font-sans ${
                        isDanger
                          ? 'border-red-500 bg-red-950/60 text-red-400 shadow-md shadow-red-500/10'
                          : (group.altura_maxima === null
                              ? 'border-amber-500 bg-slate-900 text-amber-400 shadow-md shadow-amber-500/10'
                              : 'border-emerald-500 bg-emerald-950/40 text-emerald-400')
                      }`}
                    >
                      <span className="text-sm font-black leading-none">{group.altura_maxima !== null ? group.altura_maxima.toFixed(1) : '—'}</span>
                      <span className="text-[8px] font-bold leading-none mt-0.5">{group.altura_maxima !== null ? 'metros' : 'incompleta'}</span>
                    </div>
                    <span className="text-[8px] text-slate-500 block mt-1">Consenso</span>
                  </div>
                </div>

                {/* Dispute Height Conflict Banner */}
                {group.isConflict && (
                  <div className="mt-3 bg-red-950/30 border border-red-500/30 rounded-xl p-2.5 flex items-start gap-2 animate-in slide-in-from-top duration-200">
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed text-red-300">
                      <span className="font-bold">Altura em disputa!</span> Alguns motoristas reportaram valores divergentes para este mesmo local. O sistema considera o valor mais seguro ou comum como provável (<span className="text-white font-bold">{group.altura_maxima !== null ? group.altura_maxima.toFixed(2) : '—'}m</span>).
                    </div>
                  </div>
                )}

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-700/60 space-y-4 animate-in fade-in duration-200">
                    
                    {/* General Group Coordinates */}
                    <div className="flex justify-between items-center text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded-xl border border-slate-800 font-mono">
                      <span>Lat: {group.primaryBridge.latitude.toFixed(6)}</span>
                      <span>Lng: {group.primaryBridge.longitude.toFixed(6)}</span>
                      <span>Cadastros: {group.bridges.length} registro(s)</span>
                    </div>

                    {/* Bridge Notes List */}
                    {group.notesList.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Observações Coletivas:</span>
                        <div className="space-y-1">
                          {group.notesList.map((note, index) => (
                            <p key={index} className="text-xs text-slate-200 italic pl-2.5 border-l border-red-500/50">
                              "{note}"
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sub-list of all raw reports contributing to this cluster */}
                    <div className="space-y-2 pt-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-amber-400" />
                        <span>Relatórios individuais neste local (Raio 30m)</span>
                      </span>
                      <div className="space-y-2">
                        {group.bridges.map((subBridge) => (
                          <div key={subBridge.id} className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded ${
                                  subBridge.origem === 'sistema'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                }`}>
                                  {subBridge.origem === 'sistema' ? 'SISTEMA' : 'MOTORISTA'}
                                </span>
                                {subBridge.confirmada && (
                                  <span className="text-[9px] uppercase font-bold text-emerald-400 flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    <Check className="h-3 w-3" /> CONFIRMADA
                                  </span>
                                )}
                                {!subBridge.confirmada && (
                                  <span className="text-[9px] uppercase font-bold text-amber-500/80 flex items-center gap-0.5 bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-500/10 animate-pulse">
                                    Em validação
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-bold text-slate-300 font-mono">
                                Altura: <strong className="text-white">{subBridge.altura_maxima !== null ? `${subBridge.altura_maxima.toFixed(2)}m` : 'Incompleta'}</strong>
                              </span>
                            </div>

                            {subBridge.notas && (
                              <p className="text-xs text-slate-400 leading-normal pl-1.5 border-l border-slate-700">
                                {subBridge.notas}
                              </p>
                            )}

                            {/* Sub-bridge specific photo thumbnail if present */}
                            {subBridge.photoDataUrl && (
                              <div className="pt-1">
                                <span className="text-[9px] text-slate-400 font-semibold block mb-1">Foto anexada:</span>
                                <div 
                                  onClick={() => setSelectedPhoto(subBridge.photoDataUrl || null)}
                                  className="h-10 w-24 rounded border border-slate-700 bg-slate-950 overflow-hidden cursor-pointer"
                                >
                                  <img src={subBridge.photoDataUrl} alt="Pequena" className="h-full w-full object-cover hover:scale-105 transition-all" />
                                </div>
                              </div>
                            )}

                            <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-800/40">
                              <span>Id: {subBridge.id}</span>
                              <span>Data: {new Date(subBridge.data_criacao).toLocaleDateString()}</span>
                            </div>

                            {/* Individual Edit/Delete Controls */}
                            <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-850">
                              <button
                                onClick={() => onConfirm(subBridge.id, !subBridge.confirmada)}
                                className={`px-2 py-1 rounded text-[9px] font-bold flex items-center gap-1 cursor-pointer border ${
                                  subBridge.confirmada
                                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/60'
                                    : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300'
                                }`}
                                id={`btn-sub-confirm-${subBridge.id}`}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span>{subBridge.confirmada ? 'Desconfirmar' : 'Confirmar'}</span>
                              </button>

                              <button
                                onClick={() => onEdit(subBridge)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-750 rounded text-[9px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer"
                                id={`btn-sub-edit-${subBridge.id}`}
                              >
                                <Edit3 className="h-3 w-3 text-amber-500" />
                                <span>Editar</span>
                              </button>

                              {subBridge.origem === 'motorista' && (
                                deletingId === subBridge.id ? (
                                  <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                                    <button
                                      onClick={() => {
                                        onDelete(subBridge.id);
                                        setDeletingId(null);
                                      }}
                                      className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[9px] font-black flex items-center gap-1 cursor-pointer shadow-md"
                                      id={`btn-sub-delete-confirm-${subBridge.id}`}
                                      title="Confirmar exclusão definitiva"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      <span>Sim, Excluir</span>
                                    </button>
                                    <button
                                      onClick={() => setDeletingId(null)}
                                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] font-bold border border-slate-700 cursor-pointer"
                                      id={`btn-sub-delete-cancel-${subBridge.id}`}
                                    >
                                      <span>Cancelar</span>
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeletingId(subBridge.id)}
                                    className="px-2 py-1 bg-red-950/40 hover:bg-red-900/50 border border-red-500/20 rounded text-[9px] font-bold text-red-400 flex items-center gap-1 cursor-pointer transition-all"
                                    id={`btn-sub-delete-trigger-${subBridge.id}`}
                                    title="Excluir este relatório"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>Excluir</span>
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Shared External Route Buttons */}
                    <div className="pt-2 border-t border-slate-800/60">
                      <a
                        href={getGoogleMapsDirectionUrl(group.primaryBridge.latitude, group.primaryBridge.longitude)}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full p-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-center text-xs font-bold text-white flex items-center justify-center space-x-1.5 cursor-pointer"
                        id={`btn-group-maps-${group.id}`}
                      >
                        <Map className="h-4 w-4" />
                        <span>Abrir Rota Coletiva no Google Maps</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Full-screen Photo Preview Overlay */}
      {selectedPhoto && (
        <div 
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-55 bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-zoom-out"
        >
          <div className="relative max-w-xl w-full flex flex-col items-center">
            <button 
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-2 right-2 p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full cursor-pointer z-10"
              title="Fechar visualização"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl">
              <img src={selectedPhoto} alt="Visualização ampliada da ponte" className="max-h-[75vh] w-auto object-contain mx-auto" />
            </div>
            <p className="text-slate-400 text-xs mt-3 bg-slate-900/50 px-3 py-1.5 rounded-full">
              Fotografia de registro local offline
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
