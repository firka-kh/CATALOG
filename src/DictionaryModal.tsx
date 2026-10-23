import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, Save, Pencil, Check, Building2, User, Phone, Mail, MapPin, Key, Globe, Download, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { downloadSuppliersRegistryExcel, SupplierExportEntry, downloadFacilitatorsRegistryExcel, FacilitatorExportEntry } from './lib/excelExport';
import { formatSupplierCode } from './lib/supplierUtils';

export function getNextSupplierCode(existingCodes: string[]): string {
  const usedNumbers = new Set<number>();
  for (const c of existingCodes) {
    if (!c) continue;
    const match = c.match(/(?:SPMEI|ПОС|POS)[-_](\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= 100) {
        usedNumbers.add(num);
      }
    }
  }
  let n = 100;
  while (usedNumbers.has(n)) {
    n++;
  }
  return `SPMEI-${n}`;
}

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
  supplierSpheres?: Record<string, string[]>;
  supplierAllRegions?: Record<string, boolean>;
  supplierRegions?: Record<string, string[]>;
  supplierDistricts?: Record<string, string[]>;
  supplierAssignedCodes?: Record<string, string>;
  facilitators?: string[];
  facilitatorLegalNames?: Record<string, string>;
  facilitatorRepresentatives?: Record<string, string>;
  facilitatorPhones?: Record<string, string>;
  facilitatorEmails?: Record<string, string>;
  facilitatorRegions?: Record<string, string>;
  facilitatorCodes?: Record<string, string>;
  adminPassword?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: DictionaryData;
  onSave: (data: DictionaryData, shouldClose?: boolean) => void;
}

export function DictionaryModal({ isOpen, onClose, data, onSave }: Props) {
  const [tab, setTab] = useState<'regions' | 'spheres' | 'suppliers' | 'logistics' | 'facilitators' | 'settings'>('regions');
  const [localData, setLocalData] = useState<DictionaryData>(data);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  // For new entries
  const [newRegion, setNewRegion] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [newSphere, setNewSphere] = useState('');

  // Confirmation dialogs
  const [deleteConfirmRegion, setDeleteConfirmRegion] = useState<{
    region: string;
    districtsCount: number;
  } | null>(null);

  // For suppliers
  const [newSupplierLegalName, setNewSupplierLegalName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierSpheres, setNewSupplierSpheres] = useState<string[]>([]);
  const [newSupplierAllRegions, setNewSupplierAllRegions] = useState(true);
  const [newSupplierRegions, setNewSupplierRegions] = useState<string[]>([]);
  const [newSupplierDistricts, setNewSupplierDistricts] = useState<Record<string, string[]>>({});

  const [editingSupplierKey, setEditingSupplierKey] = useState<string | null>(null);
  const [editSupplierLegalName, setEditSupplierLegalName] = useState('');
  const [editSupplierPhone, setEditSupplierPhone] = useState('');
  const [editSupplierSpheres, setEditSupplierSpheres] = useState<string[]>([]);
  const [editSupplierAllRegions, setEditSupplierAllRegions] = useState(true);
  const [editSupplierRegions, setEditSupplierRegions] = useState<string[]>([]);
  const [editSupplierDistricts, setEditSupplierDistricts] = useState<Record<string, string[]>>({});
  const [editSupplierPin, setEditSupplierPin] = useState('');
  const [copiedPortalKey, setCopiedPortalKey] = useState<string | null>(null);
  const [savedPinKey, setSavedPinKey] = useState<string | null>(null);

  const [deleteConfirmSupplier, setDeleteConfirmSupplier] = useState<{
    slotKey: string;
    code: string;
    legalName: string;
    idx: number;
    codeOrName: string;
  } | null>(null);

  // For facilitators
  const [newFacilitatorLegalName, setNewFacilitatorLegalName] = useState('');
  const [newFacilitatorRep, setNewFacilitatorRep] = useState('');
  const [newFacilitatorPhone, setNewFacilitatorPhone] = useState('');
  const [newFacilitatorEmail, setNewFacilitatorEmail] = useState('');
  const [newFacilitatorRegion, setNewFacilitatorRegion] = useState('');
  const [newFacilitatorCode, setNewFacilitatorCode] = useState('');
  const [editingFacilitatorKey, setEditingFacilitatorKey] = useState<string | null>(null);
  const [editFacilitatorLegalName, setEditFacilitatorLegalName] = useState('');
  const [editFacilitatorRep, setEditFacilitatorRep] = useState('');
  const [editFacilitatorPhone, setEditFacilitatorPhone] = useState('');
  const [editFacilitatorEmail, setEditFacilitatorEmail] = useState('');
  const [editFacilitatorRegion, setEditFacilitatorRegion] = useState('');
  const [editFacilitatorCode, setEditFacilitatorCode] = useState('');

  // Sync data when opened
  useEffect(() => {
    if (isOpen) {
      const ensuredPricingRules = data.pricingRules || {
        supplier1: {},
        supplier2: {},
        supplier3: {},
        supplier4: {}
      };

      // Normalize suppliers so each has a ПОС-XXX code and legal name
      const rawSuppliers = data.suppliers || [];
      const assignedCodes = { ...(data.supplierAssignedCodes || {}) };
      const legalNames = { ...(data.supplierLegalNames || {}) };
      const phones = { ...(data.supplierPhones || {}) };
      const spheres = { ...(data.supplierSpheres || {}) };
      const allRegs = { ...(data.supplierAllRegions || {}) };
      const regs = { ...(data.supplierRegions || {}) };
      const dists = { ...(data.supplierDistricts || {}) };
      const pins = { ...(data.supplierCodes || {}) };

      const existingCodesList: string[] = [];
      const normalizedSuppliers: string[] = [];

      rawSuppliers.forEach((s, idx) => {
        let slotKey = "";
        for (const [k, v] of Object.entries(assignedCodes)) {
          if (v === s) {
            slotKey = k;
            break;
          }
        }
        if (!slotKey && /^supplier\d+$/i.test(s)) {
          slotKey = s;
        }
        if (!slotKey) {
          slotKey = `supplier${idx + 2}`;
        }

        let code = assignedCodes[slotKey];
        if (!code || !code.toUpperCase().startsWith("SPMEI-")) {
          if (s && s.toUpperCase().startsWith("SPMEI-")) {
            code = s.toUpperCase();
          } else {
            code = getNextSupplierCode(existingCodesList);
          }
          assignedCodes[slotKey] = code;
        }
        existingCodesList.push(code);

        if (!legalNames[slotKey] && !s.match(/^(?:SPMEI|ПОС|POS)[-_]\d+$/i) && s.trim()) {
          legalNames[slotKey] = s;
        }
        if (allRegs[slotKey] === undefined) {
          allRegs[slotKey] = true;
        }
        normalizedSuppliers.push(code);
      });

      // Normalize facilitator regions
      const rawFacilitatorRegions = { ...(data.facilitatorRegions || {}) };
      for (const [k, v] of Object.entries(rawFacilitatorRegions)) {
        if (v === "Вилояти Суғд" || v === "Вилояти Сугд") {
          rawFacilitatorRegions[k] = "Согдийская область";
        }
      }

      // Filter out dangling legacy "Вилояти Суғд" / "Вилояти Сугд" if empty
      const normalizedRegions = (data.regions || []).filter(r => {
        if (r === "Вилояти Суғд" || r === "Вилояти Сугд") {
          return ((data.districtsByRegion || {})[r] || []).length > 0;
        }
        return true;
      });

      setLocalData({
        ...data,
        regions: normalizedRegions,
        pricingRules: ensuredPricingRules,
        suppliers: normalizedSuppliers,
        supplierAssignedCodes: assignedCodes,
        supplierLegalNames: legalNames,
        supplierPhones: phones,
        supplierSpheres: spheres,
        supplierAllRegions: allRegs,
        supplierRegions: regs,
        supplierDistricts: dists,
        supplierCodes: pins,
        facilitators: data.facilitators || [],
        facilitatorLegalNames: data.facilitatorLegalNames || {},
        facilitatorRepresentatives: data.facilitatorRepresentatives || {},
        facilitatorPhones: data.facilitatorPhones || {},
        facilitatorEmails: data.facilitatorEmails || {},
        facilitatorRegions: rawFacilitatorRegions,
        facilitatorCodes: data.facilitatorCodes || {},
      });
    }
  }, [isOpen, data]);

  if (!isOpen) return null;

  const facilitatorRegionOptions = Array.from(new Set([
    ...(localData.regions || []),
    ...(Object.values(localData.facilitatorRegions || {}).filter(Boolean) as string[])
  ])).filter(r => r !== "Вилояти Суғд" && r !== "Вилояти Сугд");

  const handleAddRegion = () => {
    const r = newRegion.trim();
    if (!r || (localData.regions || []).includes(r)) return;
    setLocalData(prev => ({
      ...prev,
      regions: [...(prev.regions || []), r],
      districtsByRegion: { ...(prev.districtsByRegion || {}), [r]: [] }
    }));
    setNewRegion('');
    setExpandedRegion(r);
  };

  const handleDeleteRegionClick = (region: string) => {
    const districtsCount = ((localData.districtsByRegion || {})[region] || []).length;
    // If region has districts, ask for confirmation to prevent accidental loss
    if (districtsCount > 0) {
      setDeleteConfirmRegion({ region, districtsCount });
    } else {
      // If region is empty (0 districts), delete immediately without blocking!
      executeDeleteRegion(region);
    }
  };

  const executeDeleteRegion = (region: string) => {
    setLocalData(prev => {
      const nextRegions = (prev.regions || []).filter(
        r => r !== region && r !== "Вилояти Суғд" && r !== "Вилояти Сугд"
      );
      const nextDistricts = { ...(prev.districtsByRegion || {}) };
      delete nextDistricts[region];
      delete nextDistricts["Вилояти Суғд"];
      delete nextDistricts["Вилояти Сугд"];

      // Clean up facilitator references pointing to this region
      const nextFacilitatorRegions = { ...(prev.facilitatorRegions || {}) };
      for (const [k, v] of Object.entries(nextFacilitatorRegions)) {
        if (v === region || (region === "Согдийская область" && (v === "Вилояти Суғд" || v === "Вилояти Сугд"))) {
          nextFacilitatorRegions[k] = '';
        }
      }

      // Clean up supplier references pointing to this region
      const nextSupplierRegions = { ...(prev.supplierRegions || {}) };
      for (const [k, list] of Object.entries(nextSupplierRegions)) {
        if (Array.isArray(list)) {
          nextSupplierRegions[k] = list.filter(r => r !== region);
        }
      }

      const updated: DictionaryData = {
        ...prev,
        regions: nextRegions,
        districtsByRegion: nextDistricts,
        facilitatorRegions: nextFacilitatorRegions,
        supplierRegions: nextSupplierRegions
      };

      // Persist to database without closing modal
      onSave(updated, false);
      return updated;
    });

    setDeleteConfirmRegion(null);
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

  // Compute next code for new supplier preview
  const activeCodes = Object.values(localData.supplierAssignedCodes || {}) as string[];
  const nextSupplierCodePreview = getNextSupplierCode(activeCodes);

  const handleAddSupplier = () => {
    const legalName = newSupplierLegalName.trim();
    if (!legalName) {
      alert("Пожалуйста, укажите Юридическое название поставщика");
      return;
    }

    setLocalData(prev => {
      const currentSuppliers = prev.suppliers || [];
      const assignedCodes = { ...(prev.supplierAssignedCodes || {}) };
      const currentCodes = Object.values(assignedCodes) as string[];
      const newCode = getNextSupplierCode(currentCodes);

      // Find first available slot key starting from supplier2
      let slotNum = 2;
      while (currentSuppliers.some((_, i) => `supplier${i + 2}` === `supplier${slotNum}`) || assignedCodes[`supplier${slotNum}`]) {
        slotNum++;
      }
      const slotKey = `supplier${slotNum}`;

      const nextSuppliers = [...currentSuppliers, newCode];
      assignedCodes[slotKey] = newCode;

      const nextLegalNames = { ...(prev.supplierLegalNames || {}) };
      nextLegalNames[slotKey] = legalName;

      const nextPhones = { ...(prev.supplierPhones || {}) };
      if (newSupplierPhone.trim()) {
        nextPhones[slotKey] = newSupplierPhone.trim();
      }

      const nextSpheres = { ...(prev.supplierSpheres || {}) };
      nextSpheres[slotKey] = newSupplierSpheres.length > 0 ? newSupplierSpheres : [];

      const nextAllRegions = { ...(prev.supplierAllRegions || {}) };
      nextAllRegions[slotKey] = newSupplierAllRegions;

      const nextRegions = { ...(prev.supplierRegions || {}) };
      nextRegions[slotKey] = newSupplierAllRegions ? [] : newSupplierRegions;

      const nextDistricts = { ...(prev.supplierDistricts || {}) };
      if (!newSupplierAllRegions) {
        const flatDistricts: string[] = [];
        newSupplierRegions.forEach(r => {
          if (newSupplierDistricts[r] && newSupplierDistricts[r].length > 0) {
            flatDistricts.push(...newSupplierDistricts[r]);
          }
        });
        nextDistricts[slotKey] = flatDistricts;
      } else {
        nextDistricts[slotKey] = [];
      }

      const nextCodes = { ...(prev.supplierCodes || {}) };
      if (!nextCodes[slotKey]) {
        nextCodes[slotKey] = Math.floor(1000 + Math.random() * 9000).toString();
      }

      return {
        ...prev,
        suppliers: nextSuppliers,
        supplierAssignedCodes: assignedCodes,
        supplierLegalNames: nextLegalNames,
        supplierPhones: nextPhones,
        supplierSpheres: nextSpheres,
        supplierAllRegions: nextAllRegions,
        supplierRegions: nextRegions,
        supplierDistricts: nextDistricts,
        supplierCodes: nextCodes
      };
    });

    // Reset form
    setNewSupplierLegalName('');
    setNewSupplierPhone('');
    setNewSupplierSpheres([]);
    setNewSupplierAllRegions(true);
    setNewSupplierRegions([]);
    setNewSupplierDistricts({});
  };

  const handleDeleteSupplierClick = (
    slotKey: string,
    code: string,
    idx: number,
    codeOrName: string
  ) => {
    const legalName = localData.supplierLegalNames?.[slotKey] || '';
    setDeleteConfirmSupplier({
      slotKey,
      code,
      legalName,
      idx,
      codeOrName
    });
  };

  const executeDeleteSupplier = (target: {
    slotKey: string;
    code: string;
    legalName: string;
    idx: number;
    codeOrName: string;
  }) => {
    const { slotKey, code, idx, codeOrName } = target;

    setLocalData(prev => {
      // 1. Remove from suppliers array by index and any matching code/key/name
      const nextSuppliers = (prev.suppliers || []).filter((s, i) => {
        if (i === idx) return false;
        if (s === code || s === slotKey || s === codeOrName) return false;
        if (prev.supplierAssignedCodes?.[slotKey] && s === prev.supplierAssignedCodes[slotKey]) return false;
        return true;
      });

      // 2. Remove all related slotKey data
      const nextAssignedCodes = { ...(prev.supplierAssignedCodes || {}) };
      delete nextAssignedCodes[slotKey];

      const nextLegalNames = { ...(prev.supplierLegalNames || {}) };
      delete nextLegalNames[slotKey];

      const nextPhones = { ...(prev.supplierPhones || {}) };
      delete nextPhones[slotKey];

      const nextSpheres = { ...(prev.supplierSpheres || {}) };
      delete nextSpheres[slotKey];

      const nextAllRegions = { ...(prev.supplierAllRegions || {}) };
      delete nextAllRegions[slotKey];

      const nextRegions = { ...(prev.supplierRegions || {}) };
      delete nextRegions[slotKey];

      const nextDistricts = { ...(prev.supplierDistricts || {}) };
      delete nextDistricts[slotKey];

      const nextCodes = { ...(prev.supplierCodes || {}) };
      delete nextCodes[slotKey];

      const nextPricingRules = { ...(prev.pricingRules || {}) };
      if (nextPricingRules[slotKey as keyof typeof nextPricingRules]) {
        delete (nextPricingRules as any)[slotKey];
      }

      const updated: DictionaryData = {
        ...prev,
        suppliers: nextSuppliers,
        supplierAssignedCodes: nextAssignedCodes,
        supplierLegalNames: nextLegalNames,
        supplierPhones: nextPhones,
        supplierSpheres: nextSpheres,
        supplierAllRegions: nextAllRegions,
        supplierRegions: nextRegions,
        supplierDistricts: nextDistricts,
        supplierCodes: nextCodes,
        pricingRules: nextPricingRules,
      };

      // Auto-save to Firestore so changes persist immediately
      onSave(updated);

      return updated;
    });

    setDeleteConfirmSupplier(null);
  };

  const handleStartEditSupplier = (slotKey: string) => {
    setEditingSupplierKey(slotKey);
    setEditSupplierLegalName(localData.supplierLegalNames?.[slotKey] || '');
    setEditSupplierPhone(localData.supplierPhones?.[slotKey] || '');
    setEditSupplierSpheres(localData.supplierSpheres?.[slotKey] || []);
    setEditSupplierAllRegions(localData.supplierAllRegions?.[slotKey] ?? true);
    setEditSupplierRegions(localData.supplierRegions?.[slotKey] || []);

    const distMap: Record<string, string[]> = {};
    const flatDists = localData.supplierDistricts?.[slotKey] || [];
    (localData.supplierRegions?.[slotKey] || []).forEach(reg => {
      const allDistsInReg = localData.districtsByRegion[reg] || [];
      distMap[reg] = flatDists.filter(d => allDistsInReg.includes(d));
    });
    setEditSupplierDistricts(distMap);
    setEditSupplierPin(localData.supplierCodes?.[slotKey] || '');
  };

  const handleCancelEditSupplier = () => {
    setEditingSupplierKey(null);
  };

  const handleSaveEditSupplier = (slotKey: string) => {
    const legalName = editSupplierLegalName.trim();
    if (!legalName) {
      return;
    }

    setLocalData(prev => {
      const nextLegalNames = { ...(prev.supplierLegalNames || {}) };
      nextLegalNames[slotKey] = legalName;

      const nextPhones = { ...(prev.supplierPhones || {}) };
      nextPhones[slotKey] = editSupplierPhone.trim();

      const nextSpheres = { ...(prev.supplierSpheres || {}) };
      nextSpheres[slotKey] = editSupplierSpheres;

      const nextAllRegions = { ...(prev.supplierAllRegions || {}) };
      nextAllRegions[slotKey] = editSupplierAllRegions;

      const nextRegions = { ...(prev.supplierRegions || {}) };
      nextRegions[slotKey] = editSupplierAllRegions ? [] : editSupplierRegions;

      const nextDistricts = { ...(prev.supplierDistricts || {}) };
      if (!editSupplierAllRegions) {
        const flatDistricts: string[] = [];
        editSupplierRegions.forEach(r => {
          if (editSupplierDistricts[r] && editSupplierDistricts[r].length > 0) {
            flatDistricts.push(...editSupplierDistricts[r]);
          }
        });
        nextDistricts[slotKey] = flatDistricts;
      } else {
        nextDistricts[slotKey] = [];
      }

      const nextCodes = { ...(prev.supplierCodes || {}) };
      if (editSupplierPin.trim()) {
        nextCodes[slotKey] = editSupplierPin.trim();
      }

      const updated = {
        ...prev,
        supplierLegalNames: nextLegalNames,
        supplierPhones: nextPhones,
        supplierSpheres: nextSpheres,
        supplierAllRegions: nextAllRegions,
        supplierRegions: nextRegions,
        supplierDistricts: nextDistricts,
        supplierCodes: nextCodes
      };

      onSave(updated, false);
      return updated;
    });

    setEditingSupplierKey(null);
  };

  const handleExportSuppliersExcel = async () => {
    let baseOrigin = window.location.origin;
    if (baseOrigin.includes('ais-dev-')) {
      baseOrigin = baseOrigin.replace('ais-dev-', 'ais-pre-');
    }

    const exportData: SupplierExportEntry[] = (localData.suppliers || []).map((code, idx) => {
      let slotKey = `supplier${idx + 2}`;
      if (localData.supplierAssignedCodes) {
        for (const [k, v] of Object.entries(localData.supplierAssignedCodes)) {
          if (v === code) {
            slotKey = k;
            break;
          }
        }
      }
      return {
        key: slotKey,
        code: localData.supplierAssignedCodes?.[slotKey] || code,
        legalName: localData.supplierLegalNames?.[slotKey] || '',
        phone: localData.supplierPhones?.[slotKey] || '',
        spheres: localData.supplierSpheres?.[slotKey] || [],
        allRegions: localData.supplierAllRegions?.[slotKey] ?? true,
        regions: localData.supplierRegions?.[slotKey] || [],
        districts: localData.supplierDistricts?.[slotKey] || [],
        portalUrl: `${baseOrigin}/?portal=${slotKey}`,
        pin: localData.supplierCodes?.[slotKey] || ''
      };
    });

    await downloadSuppliersRegistryExcel(exportData);
  };

  const handleExportFacilitatorsExcel = async () => {
    let baseOrigin = window.location.origin;
    if (baseOrigin.includes('ais-dev-')) {
      baseOrigin = baseOrigin.replace('ais-dev-', 'ais-pre-');
    }

    const exportData: FacilitatorExportEntry[] = (localData.facilitators || []).map((f, idx) => {
      const fKey = `facilitator${idx + 2}`;
      return {
        key: fKey,
        code: `Фасилитатор ${idx + 1} (${fKey})`,
        legalName: localData.facilitatorLegalNames?.[fKey] || f,
        representative: localData.facilitatorRepresentatives?.[fKey] || '',
        phone: localData.facilitatorPhones?.[fKey] || '',
        email: localData.facilitatorEmails?.[fKey] || '',
        region: localData.facilitatorRegions?.[fKey] || '',
        portalUrl: `${baseOrigin}/?portal=${fKey}`,
        pin: localData.facilitatorCodes?.[fKey] || ''
      };
    });

    await downloadFacilitatorsRegistryExcel(exportData);
  };

  const handleAddFacilitator = () => {
    const legalName = newFacilitatorLegalName.trim();
    if (!legalName) {
      alert("Пожалуйста, укажите Юр. название фасилитатора (организацию)");
      return;
    }
    setLocalData(prev => {
      const currentFacilitators = prev.facilitators || [];
      const nextFacilitators = currentFacilitators.includes(legalName)
        ? currentFacilitators
        : [...currentFacilitators, legalName];

      const newIdx = nextFacilitators.indexOf(legalName);
      const facilitatorKey = `facilitator${newIdx + 2}`;

      const nextLegalNames = { ...(prev.facilitatorLegalNames || {}) };
      nextLegalNames[facilitatorKey] = legalName;

      const nextReps = { ...(prev.facilitatorRepresentatives || {}) };
      if (newFacilitatorRep.trim()) {
        nextReps[facilitatorKey] = newFacilitatorRep.trim();
      }

      const nextPhones = { ...(prev.facilitatorPhones || {}) };
      if (newFacilitatorPhone.trim()) {
        nextPhones[facilitatorKey] = newFacilitatorPhone.trim();
      }

      const nextEmails = { ...(prev.facilitatorEmails || {}) };
      if (newFacilitatorEmail.trim()) {
        nextEmails[facilitatorKey] = newFacilitatorEmail.trim();
      }

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
        facilitatorLegalNames: nextLegalNames,
        facilitatorRepresentatives: nextReps,
        facilitatorPhones: nextPhones,
        facilitatorEmails: nextEmails,
        facilitatorRegions: nextRegions,
        facilitatorCodes: nextCodes
      };
    });
    setNewFacilitatorLegalName('');
    setNewFacilitatorRep('');
    setNewFacilitatorPhone('');
    setNewFacilitatorEmail('');
    setNewFacilitatorRegion('');
    setNewFacilitatorCode('');
  };

  const handleDeleteFacilitator = (f: string) => {
    setLocalData(prev => {
      const currentFacilitators = prev.facilitators || [];
      const newIdx = currentFacilitators.indexOf(f);
      const facilitatorKey = `facilitator${newIdx + 2}`;
      const nextFacilitators = currentFacilitators.filter(x => x !== f);
      
      const nextLegalNames = { ...(prev.facilitatorLegalNames || {}) };
      delete nextLegalNames[facilitatorKey];

      const nextReps = { ...(prev.facilitatorRepresentatives || {}) };
      delete nextReps[facilitatorKey];

      const nextPhones = { ...(prev.facilitatorPhones || {}) };
      delete nextPhones[facilitatorKey];

      const nextEmails = { ...(prev.facilitatorEmails || {}) };
      delete nextEmails[facilitatorKey];

      const nextRegions = { ...(prev.facilitatorRegions || {}) };
      delete nextRegions[facilitatorKey];
      
      const nextCodes = { ...(prev.facilitatorCodes || {}) };
      delete nextCodes[facilitatorKey];

      return {
        ...prev,
        facilitators: nextFacilitators,
        facilitatorLegalNames: nextLegalNames,
        facilitatorRepresentatives: nextReps,
        facilitatorPhones: nextPhones,
        facilitatorEmails: nextEmails,
        facilitatorRegions: nextRegions,
        facilitatorCodes: nextCodes
      };
    });
  };

  const handleStartEditFacilitator = (f: string, fKey: string) => {
    setEditingFacilitatorKey(fKey);
    setEditFacilitatorLegalName(localData.facilitatorLegalNames?.[fKey] || f);
    setEditFacilitatorRep(localData.facilitatorRepresentatives?.[fKey] || '');
    setEditFacilitatorPhone(localData.facilitatorPhones?.[fKey] || '');
    setEditFacilitatorEmail(localData.facilitatorEmails?.[fKey] || '');
    setEditFacilitatorRegion(localData.facilitatorRegions?.[fKey] || '');
    setEditFacilitatorCode(localData.facilitatorCodes?.[fKey] || '');
  };

  const handleCancelEditFacilitator = () => {
    setEditingFacilitatorKey(null);
    setEditFacilitatorLegalName('');
    setEditFacilitatorRep('');
    setEditFacilitatorPhone('');
    setEditFacilitatorEmail('');
    setEditFacilitatorRegion('');
    setEditFacilitatorCode('');
  };

  const handleSaveEditFacilitator = (fKey: string, oldName: string) => {
    const freshLegalName = editFacilitatorLegalName.trim() || oldName;
    setLocalData(prev => {
      const currentFacilitators = prev.facilitators || [];
      const nextFacilitators = currentFacilitators.map(f => f === oldName ? freshLegalName : f);
      const nextLegalNames = { ...(prev.facilitatorLegalNames || {}), [fKey]: freshLegalName };
      const nextReps = { ...(prev.facilitatorRepresentatives || {}), [fKey]: editFacilitatorRep.trim() };
      const nextPhones = { ...(prev.facilitatorPhones || {}), [fKey]: editFacilitatorPhone.trim() };
      const nextEmails = { ...(prev.facilitatorEmails || {}), [fKey]: editFacilitatorEmail.trim() };
      const nextRegions = { ...(prev.facilitatorRegions || {}) };
      if (editFacilitatorRegion) {
        nextRegions[fKey] = editFacilitatorRegion;
      } else {
        delete nextRegions[fKey];
      }
      const nextCodes = { ...(prev.facilitatorCodes || {}) };
      if (editFacilitatorCode.trim()) {
        nextCodes[fKey] = editFacilitatorCode.trim();
      } else {
        delete nextCodes[fKey];
      }
      return {
        ...prev,
        facilitators: nextFacilitators,
        facilitatorLegalNames: nextLegalNames,
        facilitatorRepresentatives: nextReps,
        facilitatorPhones: nextPhones,
        facilitatorEmails: nextEmails,
        facilitatorRegions: nextRegions,
        facilitatorCodes: nextCodes,
      };
    });
    setEditingFacilitatorKey(null);
    setEditFacilitatorLegalName('');
    setEditFacilitatorRep('');
    setEditFacilitatorPhone('');
    setEditFacilitatorEmail('');
    setEditFacilitatorRegion('');
    setEditFacilitatorCode('');
  };

  const handleSave = () => {
    onSave(localData, true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl lg:max-w-6xl overflow-hidden flex flex-col h-[90vh] sm:h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Управление справочниками</h2>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          <div className="bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-2 md:p-3 flex md:flex-col gap-1 shrink-0 overflow-x-auto md:overflow-x-visible scrollbar-thin">
            <button onClick={() => setTab('regions')} className={`px-3 py-1.5 md:px-4 md:py-2.5 text-xs md:text-sm font-medium rounded-md text-left transition-colors whitespace-nowrap ${tab === 'regions' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Регионы и Районы</button>
            <button onClick={() => setTab('spheres')} className={`px-3 py-1.5 md:px-4 md:py-2.5 text-xs md:text-sm font-medium rounded-md text-left transition-colors whitespace-nowrap ${tab === 'spheres' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Сферы занятости</button>
            <button onClick={() => setTab('suppliers')} className={`px-3 py-1.5 md:px-4 md:py-2.5 text-xs md:text-sm font-medium rounded-md text-left transition-colors whitespace-nowrap ${tab === 'suppliers' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Поставщики</button>
            <button onClick={() => setTab('facilitators')} className={`px-3 py-1.5 md:px-4 md:py-2.5 text-xs md:text-sm font-medium rounded-md text-left transition-colors whitespace-nowrap ${tab === 'facilitators' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Фасилитаторы</button>
            <button onClick={() => setTab('logistics')} className={`px-3 py-1.5 md:px-4 md:py-2.5 text-xs md:text-sm font-medium rounded-md text-left transition-colors whitespace-nowrap ${tab === 'logistics' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Логистика</button>
<button onClick={() => setTab('settings')} className={`px-3 py-1.5 md:px-4 md:py-2.5 text-xs md:text-sm font-medium rounded-md text-left transition-colors whitespace-nowrap ${tab === 'settings' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}>Настройки</button>
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
                      {(localData.regions || []).length === 0 && <div className="p-4 text-center text-sm text-slate-500">Нет регионов</div>}
                      {(localData.regions || []).map(r => (
                        <div key={r} className="flex flex-col">
                          <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setExpandedRegion(expandedRegion === r ? null : r)}>
                            <div className="flex items-center gap-2">
                              {expandedRegion === r ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                              <span className="font-medium text-slate-800">{r}</span>
                              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{((localData.districtsByRegion || {})[r] || []).length} районов</span>
                            </div>
                            <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteRegionClick(r); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Удалить регион"><Trash2 className="w-4 h-4" /></button>
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <span>Управление поставщиками</span>
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                            {(localData.suppliers || []).length}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Реальные названия скрыты в системе и на купонах за кодами (SPMEI-100, SPMEI-101...).
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleExportSuppliersExcel}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
                        title="Выгрузить реестр кодов и юридических названий поставщиков в Excel"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Скачать реестр (Excel)</span>
                      </button>
                    </div>

                    {/* Add form */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <Plus className="w-4 h-4 text-indigo-600" />
                          <span>Новый поставщик</span>
                        </h4>
                        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">
                          <span className="text-[11px] font-semibold text-indigo-700">Код системы:</span>
                          <span className="text-xs font-black text-indigo-900 bg-white px-2 py-0.5 rounded border border-indigo-200 shadow-2xs">
                            {nextSupplierCodePreview}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wider">
                            Юридическое название <span className="text-red-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            value={newSupplierLegalName} 
                            onChange={e => setNewSupplierLegalName(e.target.value)} 
                            placeholder="Например: ООО 'АгроСнабСервис'..." 
                            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wider">Телефон</label>
                          <input 
                            type="text" 
                            value={newSupplierPhone} 
                            onChange={e => setNewSupplierPhone(e.target.value)} 
                            placeholder="+998 90 123 45 67..." 
                            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Spheres multi-select */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Сферы занятости (можно выбрать несколько)
                          </label>
                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setNewSupplierSpheres([...localData.spheres])}
                              className="text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                            >
                              Выбрать все
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => setNewSupplierSpheres([])}
                              className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                            >
                              Снять выбор
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 p-2 bg-white border border-slate-200 rounded-lg max-h-32 overflow-y-auto">
                          {localData.spheres.length === 0 && (
                            <span className="text-xs text-slate-400">Сферы не добавлены в справочник</span>
                          )}
                          {localData.spheres.map(sphere => {
                            const isSelected = newSupplierSpheres.includes(sphere);
                            return (
                              <button
                                type="button"
                                key={sphere}
                                onClick={() => {
                                  if (isSelected) {
                                    setNewSupplierSpheres(prev => prev.filter(s => s !== sphere));
                                  } else {
                                    setNewSupplierSpheres(prev => [...prev, sphere]);
                                  }
                                }}
                                className={`px-2.5 py-1 text-xs rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                                  isSelected
                                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3" />}
                                <span>{sphere}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Geography selection */}
                      <div className="space-y-2 pt-1">
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Закрепление географии (Регионы и районы)
                        </label>
                        
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setNewSupplierAllRegions(true)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                              newSupplierAllRegions
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs'
                                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Globe className="w-3.5 h-3.5 text-emerald-600" />
                            <span>🌐 Вся страна (все регионы)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewSupplierAllRegions(false)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                              !newSupplierAllRegions
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-2xs'
                                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Выбрать отдельные регионы</span>
                          </button>
                        </div>

                        {newSupplierAllRegions ? (
                          <div className="text-xs text-emerald-800 bg-emerald-50/80 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              Поставщик закреплен <strong>по всей стране</strong>. Районы не требуют индивидуального выбора.
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2 bg-white border border-slate-200 rounded-lg p-3 max-h-56 overflow-y-auto">
                            <div className="text-xs text-slate-500 font-medium mb-1">
                              Отметьте регионы, которые обслуживает поставщик:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {localData.regions.map(r => {
                                const isChecked = newSupplierRegions.includes(r);
                                const districts = localData.districtsByRegion[r] || [];
                                const selDists = newSupplierDistricts[r] || [];

                                return (
                                  <div key={r} className="border border-slate-200 rounded-md p-2 bg-slate-50/50">
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                                      <input 
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={e => {
                                          if (e.target.checked) {
                                            setNewSupplierRegions(prev => [...prev, r]);
                                          } else {
                                            setNewSupplierRegions(prev => prev.filter(x => x !== r));
                                            setNewSupplierDistricts(prev => {
                                              const next = { ...prev };
                                              delete next[r];
                                              return next;
                                            });
                                          }
                                        }}
                                        className="rounded text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span>{r}</span>
                                    </label>

                                    {isChecked && districts.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-slate-200 pl-4 space-y-1">
                                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold mb-1">
                                          <span>Районы:</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setNewSupplierDistricts(prev => ({
                                                ...prev,
                                                [r]: selDists.length === districts.length ? [] : [...districts]
                                              }));
                                            }}
                                            className="text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                          >
                                            {selDists.length === districts.length ? 'Снять все' : 'Все районы'}
                                          </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                          {districts.map(d => {
                                            const isDistChecked = selDists.includes(d);
                                            return (
                                              <button
                                                type="button"
                                                key={d}
                                                onClick={() => {
                                                  setNewSupplierDistricts(prev => {
                                                    const cur = prev[r] || [];
                                                    const nextList = isDistChecked
                                                      ? cur.filter(x => x !== d)
                                                      : [...cur, d];
                                                    return { ...prev, [r]: nextList };
                                                  });
                                                }}
                                                className={`text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                                                  isDistChecked
                                                    ? 'bg-indigo-600 text-white font-medium'
                                                    : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                                                }`}
                                              >
                                                {d}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end pt-2">
                        <button 
                          type="button"
                          onClick={handleAddSupplier} 
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg shadow-sm transition-colors text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-4 h-4"/> Добавить поставщика ({nextSupplierCodePreview})
                        </button>
                      </div>
                    </div>

                    {/* Suppliers list */}
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-2xs">
                      {(localData.suppliers || []).length === 0 && (
                        <div className="p-8 text-center text-sm text-slate-500">
                          Нет добавленных поставщиков. Заполните форму выше для добавления.
                        </div>
                      )}
                      {(localData.suppliers || []).map((codeOrName, idx) => {
                        let slotKey = `supplier${idx + 2}`;
                        if (localData.supplierAssignedCodes) {
                          for (const [k, v] of Object.entries(localData.supplierAssignedCodes)) {
                            if (v === codeOrName) {
                              slotKey = k;
                              break;
                            }
                          }
                        }

                        const assignedCode = formatSupplierCode(slotKey, localData.supplierAssignedCodes?.[slotKey] || codeOrName, idx);
                        const legalName = localData.supplierLegalNames?.[slotKey] || '';
                        const phone = localData.supplierPhones?.[slotKey] || '';
                        const spheres = localData.supplierSpheres?.[slotKey] || [];
                        const isAllReg = localData.supplierAllRegions?.[slotKey] ?? true;
                        const regions = localData.supplierRegions?.[slotKey] || [];
                        const districts = localData.supplierDistricts?.[slotKey] || [];
                        const pin = localData.supplierCodes?.[slotKey] || '';

                        const isEditing = editingSupplierKey === slotKey;

                        let baseOrigin = window.location.origin;
                        if (baseOrigin.includes('ais-dev-')) {
                          baseOrigin = baseOrigin.replace('ais-dev-', 'ais-pre-');
                        }
                        const portalUrl = `${baseOrigin}/?portal=${slotKey}`;

                        return (
                          <div key={slotKey} className="p-4 hover:bg-slate-50/50 transition-colors">
                            {isEditing ? (
                              <div className="flex flex-col gap-4 bg-indigo-50/60 p-4 rounded-xl border border-indigo-200 w-full">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-indigo-900 bg-white px-2.5 py-1 rounded-md border border-indigo-300 shadow-2xs">
                                      {assignedCode}
                                    </span>
                                    <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">
                                      Редактирование анкеты поставщика
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-500 font-mono">
                                    Ключ: {slotKey}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                                      Юридическое (реальное) название *
                                    </label>
                                    <input 
                                      type="text"
                                      value={editSupplierLegalName}
                                      onChange={e => setEditSupplierLegalName(e.target.value)}
                                      className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                                      autoFocus
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                                      Телефон
                                    </label>
                                    <input 
                                      type="text"
                                      value={editSupplierPhone}
                                      onChange={e => setEditSupplierPhone(e.target.value)}
                                      placeholder="+7 (999) 000-00-00"
                                      className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-indigo-700 mb-1 uppercase tracking-wider flex items-center gap-1">
                                      <Key className="w-3 h-3 text-indigo-500" />
                                      Секретный PIN (пароль) *
                                    </label>
                                    <input 
                                      type="text"
                                      value={editSupplierPin}
                                      onChange={e => setEditSupplierPin(e.target.value)}
                                      placeholder="Например: 0121026@"
                                      className="w-full border border-indigo-300 rounded-md px-3 py-1.5 text-sm bg-indigo-50/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold text-indigo-800"
                                    />
                                  </div>
                                </div>

                                {/* Edit spheres */}
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                                    Сферы деятельности
                                  </label>
                                  <div className="flex flex-wrap gap-1.5 p-2 bg-white border border-slate-200 rounded-lg max-h-28 overflow-y-auto">
                                    {localData.spheres.map(sphere => {
                                      const isSel = editSupplierSpheres.includes(sphere);
                                      return (
                                        <button
                                          type="button"
                                          key={sphere}
                                          onClick={() => {
                                            if (isSel) {
                                              setEditSupplierSpheres(prev => prev.filter(x => x !== sphere));
                                            } else {
                                              setEditSupplierSpheres(prev => [...prev, sphere]);
                                            }
                                          }}
                                          className={`px-2 py-0.5 text-xs rounded transition-all cursor-pointer ${
                                            isSel
                                              ? 'bg-indigo-600 text-white font-medium shadow-2xs'
                                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                          }`}
                                        >
                                          {isSel && '✓ '}
                                          {sphere}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Edit geography */}
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                                    География обслуживания
                                  </label>
                                  <div className="flex items-center gap-2 mb-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditSupplierAllRegions(true)}
                                      className={`px-2.5 py-1 text-xs font-semibold rounded-md border cursor-pointer ${
                                        editSupplierAllRegions
                                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                                          : 'bg-white border-slate-300 text-slate-600'
                                      }`}
                                    >
                                      🌐 Вся страна (все регионы)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditSupplierAllRegions(false)}
                                      className={`px-2.5 py-1 text-xs font-semibold rounded-md border cursor-pointer ${
                                        !editSupplierAllRegions
                                          ? 'bg-indigo-50 border-indigo-500 text-indigo-800'
                                          : 'bg-white border-slate-300 text-slate-600'
                                      }`}
                                    >
                                      📍 Отдельные регионы
                                    </button>
                                  </div>

                                  {!editSupplierAllRegions && (
                                    <div className="p-2 bg-white border border-slate-200 rounded-lg max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {localData.regions.map(r => {
                                        const isChk = editSupplierRegions.includes(r);
                                        return (
                                          <label key={r} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                                            <input 
                                              type="checkbox"
                                              checked={isChk}
                                              onChange={e => {
                                                if (e.target.checked) {
                                                  setEditSupplierRegions(prev => [...prev, r]);
                                                } else {
                                                  setEditSupplierRegions(prev => prev.filter(x => x !== r));
                                                }
                                              }}
                                              className="rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span>{r}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                <div className="flex justify-end gap-2 pt-1">
                                  <button 
                                    type="button"
                                    onClick={() => handleSaveEditSupplier(slotKey)} 
                                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Сохранить анкету
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={handleCancelEditSupplier} 
                                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                                  >
                                    Отмена
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-black text-indigo-950 bg-indigo-100 border border-indigo-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
                                        {assignedCode}
                                      </span>
                                      <span className="font-bold text-slate-900 text-sm">
                                        {legalName || 'Юр. название не указано'}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                        {slotKey}
                                      </span>
                                    </div>

                                    {phone && (
                                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                        <Phone className="w-3 h-3 text-slate-400" />
                                        <span>{phone}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <button 
                                      type="button"
                                      onClick={() => handleStartEditSupplier(slotKey)} 
                                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                      title="Редактировать анкету поставщика"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={() => handleDeleteSupplierClick(slotKey, assignedCode, idx, codeOrName)} 
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" 
                                      title={`Удалить поставщика (код ${assignedCode})`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {/* Spheres and geography preview */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                                      Сферы занятости:
                                    </span>
                                    {spheres.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {spheres.map(sph => (
                                          <span key={sph} className="bg-white border border-indigo-200 text-indigo-800 text-[11px] px-1.5 py-0.5 rounded font-medium">
                                            {sph}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-slate-500 italic">Все сферы (без ограничений)</span>
                                    )}
                                  </div>

                                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                                      Охват географии:
                                    </span>
                                    {isAllReg ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                                        🌐 Вся страна (все регионы и районы)
                                      </span>
                                    ) : (
                                      <div className="flex flex-wrap gap-1">
                                        {regions.length > 0 ? (
                                          regions.map(r => (
                                            <span key={r} className="bg-white border border-slate-300 text-slate-700 text-[11px] px-1.5 py-0.5 rounded">
                                              {r}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-slate-500 italic">Регионы не выбраны</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Portal Link and PIN */}
                                <div className="flex flex-col gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-28">
                                      Ссылка (Портал):
                                    </span>
                                    <input 
                                      type="text" 
                                      readOnly 
                                      value={portalUrl} 
                                      className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-600 outline-none select-all"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(portalUrl);
                                        setCopiedPortalKey(slotKey);
                                        setTimeout(() => setCopiedPortalKey(null), 2000);
                                      }}
                                      className="px-2.5 py-1 bg-white border border-slate-300 shadow-2xs rounded text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1"
                                      title="Скопировать ссылку"
                                    >
                                      {copiedPortalKey === slotKey ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span className="text-emerald-700">Скопировано!</span>
                                        </>
                                      ) : (
                                        "Копировать"
                                      )}
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-28 flex items-center gap-1">
                                      <Key className="w-3 h-3 text-indigo-500" />
                                      Секретный PIN:
                                    </span>
                                    <input 
                                      type="text" 
                                      value={pin}
                                      onChange={(e) => {
                                        const nextCodes = { ...(localData.supplierCodes || {}) };
                                        nextCodes[slotKey] = e.target.value;
                                        setLocalData((prev: any) => ({ ...prev, supplierCodes: nextCodes }));
                                      }}
                                      onBlur={() => {
                                        const nextCodes = { ...(localData.supplierCodes || {}) };
                                        onSave({ ...localData, supplierCodes: nextCodes }, false);
                                        setSavedPinKey(slotKey);
                                        setTimeout(() => setSavedPinKey(null), 2500);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const nextCodes = { ...(localData.supplierCodes || {}) };
                                          onSave({ ...localData, supplierCodes: nextCodes }, false);
                                          setSavedPinKey(slotKey);
                                          setTimeout(() => setSavedPinKey(null), 2500);
                                        }
                                      }}
                                      placeholder="Код для входа (например: 0121026@)..."
                                      className="w-48 text-xs bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold text-indigo-800 shadow-2xs"
                                    />
                                    {savedPinKey === slotKey ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
                                        <Check className="w-3.5 h-3.5" />
                                        Сохранено!
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-slate-400">
                                        (Пароль для входа в веб-приложение, на портал и в бот)
                                      </span>
                                    )}
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Управление фасилитаторами</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Настройка организаций-фасилитаторов, представителей, контактных данных и персональных порталов
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleExportFacilitatorsExcel}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
                        title="Выгрузить реестр фасилитаторов и контактов в Excel"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Скачать реестр (Excel)</span>
                      </button>
                    </div>
                    
                    {/* Add form */}
                    <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200 mb-6 space-y-4 shadow-sm">
                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                        Новый фасилитатор
                      </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* 1. Юр. название (Организация) */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Юр. название (Организация) <span className="text-red-500">*</span></span>
                          </label>
                          <input 
                            type="text" 
                            value={newFacilitatorLegalName} 
                            onChange={e => setNewFacilitatorLegalName(e.target.value)} 
                            placeholder="ООО «Агро-Сервис» или ОО «Рушд»..." 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                            onKeyDown={e => e.key === 'Enter' && handleAddFacilitator()}
                          />
                        </div>

                        {/* 2. ФИО основного представителя */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span>ФИО основного представителя</span>
                          </label>
                          <input 
                            type="text" 
                            value={newFacilitatorRep} 
                            onChange={e => setNewFacilitatorRep(e.target.value)} 
                            placeholder="Каримов Алишер Собирович..." 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                            onKeyDown={e => e.key === 'Enter' && handleAddFacilitator()}
                          />
                        </div>

                        {/* 3. Основной телефон фирмы */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            <span>Основной телефон фирмы</span>
                          </label>
                          <input 
                            type="tel" 
                            value={newFacilitatorPhone} 
                            onChange={e => setNewFacilitatorPhone(e.target.value)} 
                            placeholder="+992 900 00 00 00..." 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                            onKeyDown={e => e.key === 'Enter' && handleAddFacilitator()}
                          />
                        </div>

                        {/* 4. Почта для связи */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-500" />
                            <span>Почта для связи (Email)</span>
                          </label>
                          <input 
                            type="email" 
                            value={newFacilitatorEmail} 
                            onChange={e => setNewFacilitatorEmail(e.target.value)} 
                            placeholder="info@facilitator.tj..." 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                            onKeyDown={e => e.key === 'Enter' && handleAddFacilitator()}
                          />
                        </div>

                        {/* 5. Регион */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>Регион</span>
                          </label>
                          <select 
                            value={newFacilitatorRegion} 
                            onChange={e => setNewFacilitatorRegion(e.target.value)} 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                          >
                            <option value="">Выберите регион...</option>
                            {facilitatorRegionOptions.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>

                        {/* 6. Секретный код */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5 text-slate-500" />
                            <span>Секретный код доступа</span>
                          </label>
                          <input 
                            type="text" 
                            value={newFacilitatorCode} 
                            onChange={e => setNewFacilitatorCode(e.target.value)} 
                            placeholder="Код доступа (например: 4455)..." 
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                            onKeyDown={e => e.key === 'Enter' && handleAddFacilitator()}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button 
                          onClick={handleAddFacilitator} 
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg shadow-sm transition-all text-sm font-semibold flex items-center gap-2"
                        >
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
                         const isEditingThis = editingFacilitatorKey === fKey;
                         
                         return (
                           <div key={fKey} className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-md transition-all bg-white">
                             {isEditingThis ? (
                               <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-indigo-200">
                                 <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                   <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                                     <Pencil className="w-3.5 h-3.5" />
                                     Редактирование данных фасилитатора ({fKey})
                                   </span>
                                   <div className="flex items-center gap-2">
                                     <button 
                                       onClick={() => handleSaveEditFacilitator(fKey, f)}
                                       className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
                                       title="Сохранить изменения"
                                     >
                                       <Check className="w-3.5 h-3.5" />
                                       Сохранить
                                     </button>
                                     <button 
                                       onClick={handleCancelEditFacilitator}
                                       className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                                     >
                                       Отмена
                                     </button>
                                   </div>
                                 </div>

                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                   <div>
                                     <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                       Юр. название (Организация)
                                     </label>
                                     <input 
                                       type="text" 
                                       value={editFacilitatorLegalName} 
                                       onChange={e => setEditFacilitatorLegalName(e.target.value)}
                                       className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                       placeholder="ООО..."
                                     />
                                   </div>
                                   <div>
                                     <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                       ФИО представителя
                                     </label>
                                     <input 
                                       type="text" 
                                       value={editFacilitatorRep} 
                                       onChange={e => setEditFacilitatorRep(e.target.value)}
                                       className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                       placeholder="ФИО контактного лица..."
                                     />
                                   </div>
                                   <div>
                                     <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                       Основной телефон фирмы
                                     </label>
                                     <input 
                                       type="tel" 
                                       value={editFacilitatorPhone} 
                                       onChange={e => setEditFacilitatorPhone(e.target.value)}
                                       className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                       placeholder="+992..."
                                     />
                                   </div>
                                   <div>
                                     <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                       Почта для связи (Email)
                                     </label>
                                     <input 
                                       type="email" 
                                       value={editFacilitatorEmail} 
                                       onChange={e => setEditFacilitatorEmail(e.target.value)}
                                       className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                       placeholder="email@..."
                                     />
                                   </div>
                                   <div>
                                     <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                       Регион
                                     </label>
                                     <select 
                                       value={editFacilitatorRegion} 
                                       onChange={e => setEditFacilitatorRegion(e.target.value)}
                                       className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                     >
                                       <option value="">Выберите регион...</option>
                                       {facilitatorRegionOptions.map(r => (
                                         <option key={r} value={r}>{r}</option>
                                       ))}
                                     </select>
                                   </div>
                                   <div>
                                     <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                       Секретный код доступа
                                     </label>
                                     <input 
                                       type="text" 
                                       value={editFacilitatorCode} 
                                       onChange={e => setEditFacilitatorCode(e.target.value)}
                                       className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                       placeholder="Код..."
                                     />
                                   </div>
                                 </div>
                                </div>
                             ) : (
                               <div className="flex flex-col gap-3">
                                 {/* Top Row: Name and Actions */}
                                 <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5">
                                   <div className="flex items-center gap-2.5 flex-wrap">
                                     <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                                       <Building2 className="w-4 h-4" />
                                     </div>
                                     <div>
                                       <div className="flex items-center gap-2">
                                         <span className="font-bold text-slate-900 text-sm">
                                           {localData.facilitatorLegalNames?.[fKey] || f}
                                         </span>
                                         <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                                           #{idx + 1} ({fKey})
                                         </span>
                                       </div>
                                       {localData.facilitatorRepresentatives?.[fKey] && (
                                         <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                           <User className="w-3 h-3 text-slate-400" />
                                           <span>Представитель: <strong className="text-slate-700">{localData.facilitatorRepresentatives[fKey]}</strong></span>
                                         </div>
                                       )}
                                     </div>
                                   </div>
                                   <div className="flex items-center gap-1 shrink-0">
                                     <button 
                                       onClick={() => handleStartEditFacilitator(f, fKey)} 
                                       className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                       title="Редактировать все данные фасилитатора"
                                     >
                                       <Pencil className="w-4 h-4" />
                                     </button>
                                     <button 
                                       onClick={() => handleDeleteFacilitator(f)} 
                                       className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" 
                                       title="Удалить фасилитатора"
                                     >
                                       <Trash2 className="w-4 h-4" />
                                     </button>
                                   </div>
                                 </div>
                                 
                                 {/* Facilitator Detail Grid */}
                                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                   <div>
                                     <span className="text-[10px] text-slate-400 font-semibold uppercase block flex items-center gap-1">
                                       <Phone className="w-3 h-3 text-slate-400" />
                                       Телефон:
                                     </span>
                                     <span className="font-medium text-slate-800 break-all">
                                       {localData.facilitatorPhones?.[fKey] || "—"}
                                     </span>
                                   </div>
                                   <div>
                                     <span className="text-[10px] text-slate-400 font-semibold uppercase block flex items-center gap-1">
                                       <Mail className="w-3 h-3 text-slate-400" />
                                       Email:
                                     </span>
                                     <span className="font-medium text-slate-800 break-all">
                                       {localData.facilitatorEmails?.[fKey] || "—"}
                                     </span>
                                   </div>
                                   <div>
                                     <span className="text-[10px] text-slate-400 font-semibold uppercase block flex items-center gap-1">
                                       <MapPin className="w-3 h-3 text-slate-400" />
                                       Регион:
                                     </span>
                                     <span className="font-medium text-slate-800">
                                       {localData.facilitatorRegions?.[fKey] ? (
                                         <span className="inline-block bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-900 font-semibold">
                                           {localData.facilitatorRegions[fKey]}
                                         </span>
                                       ) : "—"}
                                     </span>
                                   </div>
                                   <div>
                                     <span className="text-[10px] text-slate-400 font-semibold uppercase block flex items-center gap-1">
                                       <Key className="w-3 h-3 text-slate-400" />
                                       Код доступа:
                                     </span>
                                     <span className="font-mono font-semibold text-slate-800">
                                       {localData.facilitatorCodes?.[fKey] || "—"}
                                     </span>
                                   </div>
                                 </div>

                                 {/* Portal Link with Copy button */}
                                 <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg">
                                   <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap w-28">Ссылка (Портал):</span>
                                   <input 
                                     type="text" 
                                     readOnly 
                                     value={portalUrl} 
                                     className="flex-1 text-xs bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-600 outline-none select-all"
                                   />
                                   <button
                                     type="button"
                                     onClick={() => {
                                       navigator.clipboard.writeText(portalUrl);
                                       setCopiedPortalKey(fKey);
                                       setTimeout(() => setCopiedPortalKey(null), 2000);
                                     }}
                                     className="px-2.5 py-1 bg-white border border-slate-200 shadow-sm rounded text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer"
                                     title="Скопировать ссылку"
                                   >
                                     {copiedPortalKey === fKey ? (
                                       <>
                                         <Check className="w-3 h-3 text-emerald-600" />
                                         <span className="text-emerald-700">Скопировано!</span>
                                       </>
                                     ) : (
                                       "Копировать"
                                     )}
                                   </button>
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
              {tab === 'settings' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-2">Настройки безопасности</h3>
                    <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                      Установите пароль администратора. Он необходим для доступа к основной странице каталога.
                    </p>
                    <div className="max-w-sm">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Пароль администратора
                      </label>
                      <input
                        type="text"
                        value={localData.adminPassword || ''}
                        onChange={(e) => setLocalData(prev => ({ ...prev, adminPassword: e.target.value }))}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Например: 020779"
                      />
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

      {/* In-app confirmation dialog for deleting region with districts */}
      {deleteConfirmRegion && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Удалить регион?</h3>
                <p className="text-xs text-slate-500">Регион и все его районы будут удалены</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5 space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Регион:</span>
                <span className="font-bold text-slate-900">{deleteConfirmRegion.region}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Количество районов:</span>
                <span className="font-semibold text-indigo-700">{deleteConfirmRegion.districtsCount} районов</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              Вы действительно хотите удалить регион <strong className="text-slate-900">{deleteConfirmRegion.region}</strong>? Все входящие в него районы ({deleteConfirmRegion.districtsCount} шт.) будут безвозвратно удалены из справочника.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmRegion(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => executeDeleteRegion(deleteConfirmRegion.region)}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Да, удалить регион</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app confirmation dialog for deleting supplier */}
      {deleteConfirmSupplier && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Удалить поставщика?</h3>
                <p className="text-xs text-slate-500">Поставщик будет исключен из системы</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5 space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Код в системе:</span>
                <span className="font-mono font-black text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200 shadow-2xs">
                  {deleteConfirmSupplier.code}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Юр. название:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[200px]" title={deleteConfirmSupplier.legalName}>
                  {deleteConfirmSupplier.legalName || "Без названия"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Слот:</span>
                <span className="font-mono text-slate-600">{deleteConfirmSupplier.slotKey}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              Вы действительно хотите удалить поставщика <strong className="text-slate-900">{deleteConfirmSupplier.code}</strong>? Анкета, контакты, сферы и цены этого поставщика будут удалены, а изменения сразу зафиксируются в базе данных.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmSupplier(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => executeDeleteSupplier(deleteConfirmSupplier)}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Да, удалить поставщика</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
