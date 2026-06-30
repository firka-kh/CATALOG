import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, Save, Pencil, Check } from 'lucide-react';

interface DictionaryData {
  regions: string[];
  districtsByRegion: Record<string, string[]>;
  spheres: string[];
  suppliers: string[];
  pricingRules?: {
    supplier1?: Record<string, number>;
    supplier2?: Record<string, number>;
    supplier3?: Record<string, number>;
    supplier4?: Record<string, number>;
  };
  supplierCodes?: Record<string, string>;
  logisticsCosts?: Record<string, number>;
  supplierPhones?: Record<string, string>;
  supplierLegalNames?: Record<string, string>;
  facilitators?: string[];
  facilitatorRegions?: Record<string, string>;
  facilitatorCodes?: Record<string, string>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: DictionaryData;
  onSave: (data: DictionaryData) => void;
}

export function DictionaryModal({ isOpen, onClose, data, onSave }: Props) {
  const [tab, setTab] = useState<'regions' | 'spheres' | 'suppliers' | 'logistics' | 'facilitators'>('regions');
  const [localData, setLocalData] = useState<DictionaryData>(data);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  // For new entries
  const [newRegion, setNewRegion] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [newSphere, setNewSphere] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierLegalName, setNewSupplierLegalName] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [editSupplierName, setEditSupplierName] = useState('');

  // For facilitators
  const [newFacilitator, setNewFacilitator] = useState('');
  const [newFacilitatorRegion, setNewFacilitatorRegion] = useState('');
  const [newFacilitatorCode, setNewFacilitatorCode] = useState('');
  const [editingFacilitator, setEditingFacilitator] = useState<string | null>(null);
  const [editFacilitatorName, setEditFacilitatorName] = useState('');

  // Sync data when opened
  useEffect(() => {
    if (isOpen) {
      const ensuredPricingRules = data.pricingRules || {
        supplier1: {},
        supplier2: {},
        supplier3: {},
        supplier4: {}
      };
      setLocalData({
        ...data,
        pricingRules: ensuredPricingRules,
        suppliers: data.suppliers || [],
        facilitators: data.facilitators || [],
        facilitatorRegions: data.facilitatorRegions || {},
        facilitatorCodes: data.facilitatorCodes || {},
      });
    }
  }, [isOpen, data]);

  if (!isOpen) return null;

  const handleAddRegion = () => {
    const r = newRegion.trim();
    if (!r || localData.regions.includes(r)) return;
    setLocalData(prev => ({
      ...prev,
      regions: [...prev.regions, r],
      districtsByRegion: { ...prev.districtsByRegion, [r]: [] }
    }));
    setNewRegion('');
    setExpandedRegion(r);
  };

  const handleDeleteRegion = (region: string) => {
    if (!confirm(`Удалить регион "${region}" и все его районы?`)) return;
    setLocalData(prev => {
      const nextRegions = prev.regions.filter(r => r !== region);
      const nextDistricts = { ...prev.districtsByRegion };
      delete nextDistricts[region];
      return { ...prev, regions: nextRegions, districtsByRegion: nextDistricts };
    });
  };

  const handleAddDistrict = (region: string) => {
    const d = newDistrict.trim();
    if (!d || (localData.districtsByRegion[region] || []).includes(d)) return;
    setLocalData(prev => ({
      ...prev,
      districtsByRegion: { ...prev.districtsByRegion, [region]: [...(prev.districtsByRegion[region] || []), d] }
    }));
    setNewDistrict('');
  };

  const handleDeleteDistrict = (region: string, district: string) => {
    setLocalData(prev => ({
      ...prev,
      districtsByRegion: { ...prev.districtsByRegion, [region]: prev.districtsByRegion[region].filter(d => d !== district) }
    }));
  };

  const handleAddSphere = () => {
    const s = newSphere.trim();
    if (!s || localData.spheres.includes(s)) return;
    setLocalData(prev => ({ ...prev, spheres: [...prev.spheres, s] }));
    setNewSphere('');
  };

  const handleDeleteSphere = (sphere: string) => {
    setLocalData(prev => ({ ...prev, spheres: prev.spheres.filter(s => s !== sphere) }));
  };

  const handleAddSupplier = () => {
    const s = newSupplier.trim();
    if (!s) return;
    setLocalData(prev => {
      const currentSuppliers = prev.suppliers || [];
      const nextSuppliers = currentSuppliers.includes(s)
        ? currentSuppliers
        : [...currentSuppliers, s];
      
      const newIdx = nextSuppliers.indexOf(s);
      const supplierKey = `supplier${newIdx + 2}`;

      const nextPhones = { ...(prev.supplierPhones || {}) };
      if (newSupplierPhone.trim()) {
        nextPhones[supplierKey] = newSupplierPhone.trim();
      }

      const nextLegalNames = { ...(prev.supplierLegalNames || {}) };
      if (newSupplierLegalName.trim()) {
        nextLegalNames[supplierKey] = newSupplierLegalName.trim();
      }

      return {
        ...prev,
        suppliers: nextSuppliers,
        supplierPhones: nextPhones,
        supplierLegalNames: nextLegalNames
      };
    });
    setNewSupplier('');
    setNewSupplierPhone('');
    setNewSupplierLegalName('');
  };

  const handleDeleteSupplier = (s: string) => {
    setLocalData(prev => {
      const currentSuppliers = prev.suppliers || [];
      const nextSuppliers = currentSuppliers.filter(x => x !== s);
      return {
        ...prev,
        suppliers: nextSuppliers
      };
    });
  };

  const handleStartEditSupplier = (s: string) => {
    setEditingSupplier(s);
    setEditSupplierName(s);
  };

  const handleCancelEditSupplier = () => {
    setEditingSupplier(null);
    setEditSupplierName('');
  };

  const handleSaveEditSupplier = (oldName: string) => {
    const freshName = editSupplierName.trim();
    if (!freshName) return;
    setLocalData(prev => {
      const currentSuppliers = prev.suppliers || [];
      const nextSuppliers = currentSuppliers.map(s => s === oldName ? freshName : s);
      return {
        ...prev,
        suppliers: nextSuppliers
      };
    });
    setEditingSupplier(null);
    setEditSupplierName('');
  };

  const handleAddFacilitator = () => {
    const f = newFacilitator.trim();
    if (!f) return;
    setLocalData(prev => {
      const currentFacilitators = prev.facilitators || [];
      const nextFacilitators = currentFacilitators.includes(f)
        ? currentFacilitators
        : [...currentFacilitators, f];

      const newIdx = nextFacilitators.indexOf(f);
      const facilitatorKey = `facilitator${newIdx + 2}`;

      const nextRegions = { ...(prev.facilitatorRegions || {}) };
      if (newFacilitatorRegion) {
        nextRegions[facilitatorKey] = newFacilitatorRegion;
      }

      const nextCodes = { ...(prev.facilitatorCodes || {}) };
      if (newFacilitatorCode.trim()) {
        nextCodes[facilitatorKey] = newFacilitatorCode.trim();
      }

      return {
        ...prev,
        facilitators: nextFacilitators,
        facilitatorRegions: nextRegions,
        facilitatorCodes: nextCodes
      };
    });
    setNewFacilitator('');
    setNewFacilitatorRegion('');
    setNewFacilitatorCode('');
  };

  const handleDeleteFacilitator = (f: string) => {
    setLocalData(prev => {
      const currentFacilitators = prev.facilitators || [];
      const nextFacilitators = currentFacilitators.filter(x => x !== f);
      const newIdx = currentFacilitators.indexOf(f);
      const facilitatorKey = `facilitator${newIdx + 2}`;
      
      const nextRegions = { ...(prev.facilitatorRegions || {}) };
      delete nextRegions[facilitatorKey];
      
      const nextCodes = { ...(prev.facilitatorCodes || {}) };
      delete nextCodes[facilitatorKey];

      return {
        ...prev,
        facilitators: nextFacilitators,
        facilitatorRegions: nextRegions,
        facilitatorCodes: nextCodes
      };
    });
  };

  const handleStartEditFacilitator = (f: string) => {
    setEditingFacilitator(f);
    setEditFacilitatorName(f);
  };

  const handleCancelEditFacilitator = () => {
    setEditingFacilitator(null);
    setEditFacilitatorName('');
  };

  const handleSaveEditFacilitator = (oldName: string) => {
    const freshName = editFacilitatorName.trim();
    if (!freshName) return;
    setLocalData(prev => {
      const currentFacilitators = prev.facilitators || [];
      const nextFacilitators = currentFacilitators.map(f => f === oldName ? freshName : f);
      return {
        ...prev,
        facilitators: nextFacilitators
      };
    });
    setEditingFacilitator(null);
    setEditFacilitatorName('');
  };

  const handleSave = () => {
    onSave(localData);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Управление справочниками</h2>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 bg-slate-50 border-r border-slate-200 p-3 flex flex-col gap-1 shrink-0">
            <button onClick={() => setTab('regions')} className={`px-4 py-2.5 text-sm font-medium rounded-md text-left transition-colors ${tab === 'regions' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Регионы и Районы</button>
            <button onClick={() => setTab('spheres')} className={`px-4 py-2.5 text-sm font-medium rounded-md text-left transition-colors ${tab === 'spheres' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Сферы занятости</button>
            <button onClick={() => setTab('suppliers')} className={`px-4 py-2.5 text-sm font-medium rounded-md text-left transition-colors ${tab === 'suppliers' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Поставщики</button>
            <button onClick={() => setTab('facilitators')} className={`px-4 py-2.5 text-sm font-medium rounded-md text-left transition-colors ${tab === 'facilitators' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Фасилитаторы</button>
            <button onClick={() => setTab('logistics')} className={`px-4 py-2.5 text-sm font-medium rounded-md text-left transition-colors ${tab === 'logistics' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Логистика</button>
          </div>

          <div className="flex-1 flex flex-col min-w-0 bg-white">
            <div className="flex-1 overflow-y-auto p-6">
              {tab === 'regions' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 mb-3">Список регионов</h3>
                    <div className="flex gap-2 mb-4">
                      <input 
                         type="text" 
                         value={newRegion} 
                         onChange={e => setNewRegion(e.target.value)} 
                         placeholder="Новый регион..." 
                         className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                         onKeyDown={e => e.key === 'Enter' && handleAddRegion()}
                      />
                      <button onClick={handleAddRegion} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-1"><Plus className="w-4 h-4"/> Добавить</button>
                    </div>

                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {localData.regions.length === 0 && <div className="p-4 text-center text-sm text-slate-500">Нет регионов</div>}
                      {localData.regions.map(r => (
                        <div key={r} className="flex flex-col">
                          <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setExpandedRegion(expandedRegion === r ? null : r)}>
                            <div className="flex items-center gap-2">
                              {expandedRegion === r ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                              <span className="font-medium text-slate-800">{r}</span>
                              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{(localData.districtsByRegion[r] || []).length} районов</span>
                            </div>
                            <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteRegion(r); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Удалить регион"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                          
                          {expandedRegion === r && (
                            <div className="bg-slate-50 p-4 border-t border-slate-100 ml-6 pl-4 border-l-2 border-l-indigo-200">
                               <div className="flex gap-2 mb-3">
                                 <input 
                                    type="text" 
                                    value={newDistrict} 
                                    onChange={e => setNewDistrict(e.target.value)} 
                                    placeholder={`Новый район для ${r}...`} 
                                    className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    onKeyDown={e => { e.stopPropagation(); e.key === 'Enter' && handleAddDistrict(r); }}
                                 />
                                 <button onClick={() => handleAddDistrict(r)} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-1.5 rounded-md transition-colors text-sm font-medium flex items-center gap-1"><Plus className="w-4 h-4"/> Добавить</button>
                               </div>
                               
                               <div className="space-y-1">
                                 {(localData.districtsByRegion[r] || []).length === 0 && <div className="text-xs text-slate-400 italic">Нет районов в этом регионе</div>}
                                 {(localData.districtsByRegion[r] || []).map(d => (
                                   <div key={d} className="flex items-center justify-between py-1.5 px-3 bg-white border border-slate-200 rounded text-sm gap-4">
                                     <span className="text-slate-700 flex-1">{d}</span>
                                     <button onClick={() => handleDeleteDistrict(r, d)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                   </div>
                                 ))}
                               </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'spheres' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 mb-3">Список сфер занятости</h3>
                    <div className="flex gap-2 mb-4">
                      <input 
                         type="text" 
                         value={newSphere} 
                         onChange={e => setNewSphere(e.target.value)} 
                         placeholder="Новая сфера..." 
                         className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                         onKeyDown={e => e.key === 'Enter' && handleAddSphere()}
                      />
                      <button onClick={handleAddSphere} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-1"><Plus className="w-4 h-4"/> Добавить</button>
                    </div>

                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {localData.spheres.length === 0 && <div className="p-4 text-center text-sm text-slate-500">Нет сфер</div>}
                      {localData.spheres.map(s => (
                        <div key={s} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                          <span className="font-medium text-slate-800">{s}</span>
                          <button onClick={() => handleDeleteSphere(s)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Удалить сферу"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'suppliers' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 mb-4">Управление поставщиками</h3>
                    
                     {/* Add form */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 space-y-4">
                      <h4 className="text-sm font-semibold text-slate-700">Новый поставщик</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Поставщик</label>
                          <input 
                             type="text" 
                             value={newSupplier} 
                             onChange={e => setNewSupplier(e.target.value)} 
                             placeholder="Введите название..." 
                             className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                             onKeyDown={e => e.key === 'Enter' && handleAddSupplier()}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Телефон</label>
                          <input 
                             type="text" 
                             value={newSupplierPhone} 
                             onChange={e => setNewSupplierPhone(e.target.value)} 
                             placeholder="Введите номер телефона..." 
                             className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                             onKeyDown={e => e.key === 'Enter' && handleAddSupplier()}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Юридическое название</label>
                          <input 
                             type="text" 
                             value={newSupplierLegalName} 
                             onChange={e => setNewSupplierLegalName(e.target.value)} 
                             placeholder="Введите юр. название..." 
                             className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                             onKeyDown={e => e.key === 'Enter' && handleAddSupplier()}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button onClick={handleAddSupplier} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-1.5">
                          <Plus className="w-4 h-4"/> Добавить поставщика
                        </button>
                      </div>
                    </div>

                    {/* Suppliers list */}
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {(localData.suppliers || []).length === 0 && (
                        <div className="p-4 text-center text-sm text-slate-500">Нет поставщиков</div>
                      )}
                      {(localData.suppliers || []).map((s, idx) => {
                         const isEditing = editingSupplier === s;
                         let baseOrigin = window.location.origin;
                         if (baseOrigin.includes('ais-dev-')) {
                             baseOrigin = baseOrigin.replace('ais-dev-', 'ais-pre-');
                         }
                         const portalUrl = `${baseOrigin}/?portal=supplier${idx + 2}`;
                         return (
                           <div key={s} className="p-4 hover:bg-slate-50/50 transition-colors">
                             {isEditing ? (
                               <div className="flex flex-col gap-3 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 w-full">
                                 <div className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Редактирование данных поставщика</div>
                                 <div className="grid grid-cols-1 gap-3">
                                   <div>
                                     <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Поставщик</label>
                                     <input 
                                       type="text"
                                       value={editSupplierName}
                                       onChange={e => setEditSupplierName(e.target.value)}
                                       className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                                       onKeyDown={e => {
                                         if (e.key === 'Enter') handleSaveEditSupplier(s);
                                         if (e.key === 'Escape') handleCancelEditSupplier();
                                       }}
                                       autoFocus
                                     />
                                   </div>
                                 </div>
                                 <div className="flex justify-end gap-1.5">
                                   <button 
                                     onClick={() => handleSaveEditSupplier(s)} 
                                     className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md text-xs transition-colors flex items-center gap-1 shadow-sm"
                                     title="Сохранить"
                                   >
                                     <Check className="w-3.5 h-3.5" /> Сохранить
                                   </button>
                                   <button 
                                     onClick={handleCancelEditSupplier} 
                                     className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-md text-xs transition-colors flex items-center gap-1"
                                     title="Отмена"
                                   >
                                     <X className="w-3.5 h-3.5" /> Отмена
                                   </button>
                                 </div>
                               </div>
                             ) : (
                               <div className="flex flex-col gap-3">
                                 <div className="flex items-center justify-between">
                                     <span className="font-semibold text-slate-800 text-sm">{s}</span>
                                     <div className="flex items-center gap-1">
                                         <button 
                                           onClick={() => handleStartEditSupplier(s)} 
                                           className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                           title="Редактировать имя"
                                         >
                                           <Pencil className="w-4 h-4" />
                                         </button>
                                         <button onClick={() => handleDeleteSupplier(s)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Удалить поставщика"><Trash2 className="w-4 h-4" /></button>
                                     </div>
                                 </div>
                                 
                                 <div className="flex flex-col gap-2 bg-slate-100 p-2 rounded-md">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-32">Ссылка (Портал):</span>
                                    <input 
                                      type="text" 
                                      readOnly 
                                      value={portalUrl} 
                                      className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-600 outline-none"
                                    />
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(portalUrl);
                                        alert("Ссылка скопирована!");
                                      }}
                                      className="px-2 py-1 bg-white border border-slate-200 shadow-sm rounded text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors whitespace-nowrap"
                                      title="Скопировать ссылку"
                                    >
                                      Копировать
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-32">Секретный код:</span>
                                    <input 
                                      type="text" 
                                      value={localData.supplierCodes?.[`supplier${idx + 2}`] || ''}
                                      onChange={(e) => {
                                        const nextCodes = { ...(localData.supplierCodes || {}) };
                                        nextCodes[`supplier${idx + 2}`] = e.target.value;
                                        setLocalData((prev: any) => ({ ...prev, supplierCodes: nextCodes }));
                                      }}
                                      placeholder="Введите код для входа..."
                                      className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-32">Телефон:</span>
                                    <input 
                                      type="text" 
                                      value={localData.supplierPhones?.[`supplier${idx + 2}`] || ''}
                                      onChange={(e) => {
                                        const nextPhones = { ...(localData.supplierPhones || {}) };
                                        nextPhones[`supplier${idx + 2}`] = e.target.value;
                                        setLocalData((prev: any) => ({ ...prev, supplierPhones: nextPhones }));
                                      }}
                                      placeholder="Введите номер телефона..."
                                      className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-32">Юр. название:</span>
                                    <input 
                                      type="text" 
                                      value={localData.supplierLegalNames?.[`supplier${idx + 2}`] || ''}
                                      onChange={(e) => {
                                        const nextLegalNames = { ...(localData.supplierLegalNames || {}) };
                                        nextLegalNames[`supplier${idx + 2}`] = e.target.value;
                                        setLocalData((prev: any) => ({ ...prev, supplierLegalNames: nextLegalNames }));
                                      }}
                                      placeholder="Введите юридическое название..."
                                      className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                  </div>
                                 </div>
                               </div>
                             )}
                           </div>
                         );
                      })}
                    </div>
                  </div>
                </div>
              )}
              
              {tab === 'facilitators' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 mb-4">Управление фасилитаторами</h3>
                    
                     {/* Add form */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 space-y-4">
                      <h4 className="text-sm font-semibold text-slate-700">Новый фасилитатор</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">ФИО / Имя</label>
                          <input 
                             type="text" 
                             value={newFacilitator} 
                             onChange={e => setNewFacilitator(e.target.value)} 
                             placeholder="Введите имя..." 
                             className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                             onKeyDown={e => e.key === 'Enter' && handleAddFacilitator()}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Регион</label>
                          <select 
                             value={newFacilitatorRegion} 
                             onChange={e => setNewFacilitatorRegion(e.target.value)} 
                             className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Выберите регион...</option>
                            {localData.regions.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Секретный код</label>
                          <input 
                             type="text" 
                             value={newFacilitatorCode} 
                             onChange={e => setNewFacilitatorCode(e.target.value)} 
                             placeholder="Код доступа..." 
                             className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                             onKeyDown={e => e.key === 'Enter' && handleAddFacilitator()}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button onClick={handleAddFacilitator} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-1.5">
                          <Plus className="w-4 h-4"/>
                          Добавить фасилитатора
                        </button>
                      </div>
                    </div>

                    {/* List */}
                    <div className="space-y-3">
                      {(localData.facilitators || []).length === 0 && (
                        <div className="p-8 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
                          Нет зарегистрированных фасилитаторов
                        </div>
                      )}
                      {(localData.facilitators || []).map((f, idx) => {
                         const fKey = `facilitator${idx + 2}`;
                         const baseOrigin = window.location.origin;
                         const portalUrl = `${baseOrigin}/?portal=${fKey}`;
                         
                         return (
                           <div key={fKey} className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all bg-white">
                             {editingFacilitator === f ? (
                               <div className="flex flex-col gap-3">
                                 <div className="flex items-center gap-2">
                                   <input 
                                     type="text" 
                                     value={editFacilitatorName} 
                                     onChange={e => setEditFacilitatorName(e.target.value)}
                                     className="flex-1 border border-slate-300 rounded px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                     placeholder="Имя фасилитатора..."
                                   />
                                   <button 
                                     onClick={() => handleSaveEditFacilitator(f)}
                                     className="bg-green-600 hover:bg-green-700 text-white p-1.5 rounded transition-colors"
                                     title="Сохранить"
                                   >
                                     <Check className="w-4 h-4" />
                                   </button>
                                   <button 
                                     onClick={handleCancelEditFacilitator}
                                     className="bg-slate-100 hover:bg-slate-200 text-slate-500 p-1.5 rounded transition-colors text-xs font-semibold"
                                   >
                                     Отмена
                                   </button>
                                 </div>
                               </div>
                             ) : (
                               <div className="flex flex-col gap-3">
                                 <div className="flex items-center justify-between">
                                      <span className="font-semibold text-slate-800 text-sm">{f}</span>
                                      <div className="flex items-center gap-1">
                                          <button 
                                            onClick={() => handleStartEditFacilitator(f)} 
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                            title="Редактировать имя"
                                          >
                                            <Pencil className="w-4 h-4" />
                                          </button>
                                          <button onClick={() => handleDeleteFacilitator(f)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Удалить фасилитатора"><Trash2 className="w-4 h-4" /></button>
                                      </div>
                                 </div>
                                 
                                 <div className="flex flex-col gap-2 bg-slate-100 p-2 rounded-md">
                                   <div className="flex items-center gap-2">
                                     <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-32">Ссылка (Портал):</span>
                                     <input 
                                       type="text" 
                                       readOnly 
                                       value={portalUrl} 
                                       className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-600 outline-none"
                                     />
                                     <button
                                       onClick={() => {
                                         navigator.clipboard.writeText(portalUrl);
                                         alert("Ссылка скопирована!");
                                       }}
                                       className="px-2 py-1 bg-white border border-slate-200 shadow-sm rounded text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors whitespace-nowrap"
                                       title="Скопировать ссылку"
                                     >
                                       Копировать
                                     </button>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-32">Регион:</span>
                                     <select 
                                       value={localData.facilitatorRegions?.[fKey] || ''}
                                       onChange={(e) => {
                                         const nextRegs = { ...(localData.facilitatorRegions || {}) };
                                         nextRegs[fKey] = e.target.value;
                                         setLocalData((prev: any) => ({ ...prev, facilitatorRegions: nextRegs }));
                                       }}
                                       className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500"
                                     >
                                       <option value="">Выберите регион...</option>
                                       {localData.regions.map(r => (
                                         <option key={r} value={r}>{r}</option>
                                       ))}
                                     </select>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-32">Секретный код:</span>
                                     <input 
                                       type="text" 
                                       value={localData.facilitatorCodes?.[fKey] || ''}
                                       onChange={(e) => {
                                         const nextCodes = { ...(localData.facilitatorCodes || {}) };
                                         nextCodes[fKey] = e.target.value;
                                         setLocalData((prev: any) => ({ ...prev, facilitatorCodes: nextCodes }));
                                       }}
                                       placeholder="Введите код для входа..."
                                       className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                     />
                                   </div>
                                 </div>
                               </div>
                             )}
                           </div>
                         );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'logistics' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-2">Логистика по регионам</h3>
                    <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                      Укажите стоимость логистики для каждого региона. Эта сумма будет автоматически добавлена к стоимости товара в корзине в зависимости от выбранного региона.
                    </p>

                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
                            <th className="p-3 pl-4">Регион</th>
                            <th className="p-3 border-l border-slate-200 text-right pr-4 w-48">Стоимость (сом.)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {localData.regions.map(r => {
                            const currentVal = localData.logisticsCosts?.[r] ?? 0;
                            return (
                              <tr key={r} className="hover:bg-slate-50/50">
                                <td className="p-3 pl-4 font-semibold text-slate-700">{r}</td>
                                <td className="p-2 border-l border-slate-100 text-right pr-4">
                                  <div className="inline-flex items-center justify-end gap-2 w-full">
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={currentVal}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        const finalVal = isNaN(val) ? 0 : val;
                                        setLocalData(prev => ({
                                          ...prev,
                                          logisticsCosts: {
                                            ...(prev.logisticsCosts || {}),
                                            [r]: finalVal
                                          }
                                        }));
                                      }}
                                      className="w-24 text-right border border-slate-300 rounded px-2 py-1 text-sm font-semibold font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none focus:border-indigo-500"
                                      placeholder="0"
                                    />
                                    <span className="text-slate-400 font-bold select-none text-xs">с.</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
               <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">Отмена</button>
               <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-2">
                 <Save className="w-4 h-4" />
                 Сохранить изменения
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
