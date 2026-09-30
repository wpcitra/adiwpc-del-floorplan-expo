import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  HardHat, Save, Download, Eye, EyeOff, History, Loader2, AlertTriangle, RefreshCw, FileImage, FileText, Zap, Map as MapIcon, ChevronDown
} from 'lucide-react';
import CanvasEditor from '../../components/admin/CanvasEditor';
import ToolSidebar from '../../components/admin/ToolSidebar';
import PropertyPanel from '../../components/admin/PropertyPanel';
import CanvasBottomBar from '../../components/admin/CanvasBottomBar';
import OpsInspector, { OpsElementSection } from '../../components/admin/OpsInspector';
import SalesChangesPanel from '../../components/admin/SalesChangesPanel';
import { DEFAULT_GRID_SCALE, applyBoothCorners } from '../../utils/floorplanUtils';
import { captionText } from '../../utils/elementCaptions';
import {
  OPS_SERIALIZE_PROPS, SALES_DIM_OPACITY, OPS_LOCK_MESSAGE, boothKeyOf, emptyBoothOps, captureAnchor, findAnchorBooth,
  resolveAnchors, findOpsConflicts, boothUnder, diffBoothSummaries, drawOpsOverlay, objectCenterOf,
  hasWideDrawing, footprintPolygon, pointInPolygon
} from '../../utils/opsLayer';
import { exportOpsFloorplan } from '../../utils/opsExport';
import { isShapeElement } from '../../utils/elementLibrary';
import ShapeStyleSection from '../../components/admin/ShapeStyleSection';
import { refreshMergeRendering } from '../../utils/boothMerge';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// Denah Operasional (see AGENTS.md §17): the sales floorplan is loaded read-only (dimmed, locked) and the
// operations team edits its own layer on top of it. Only the operational layer and per-booth operations data
// are saved (PUT /api/ops/:id); the sales canvas is never written from this page.

const AUTOSAVE_DELAY_MS = 2500;
const POLL_MS = 15000;
const LAST_FP_KEY = 'ops_last_floorplan';
const AUTOSAVE_KEY = 'ops_autosave_enabled';

const SAVE_LABELS = {
  saved: { text: 'Tersimpan', cls: 'text-emerald-400' },
  unsaved: { text: 'Ada perubahan', cls: 'text-amber-300' },
  saving: { text: 'Menyimpan…', cls: 'text-slate-300' },
  error: { text: 'Gagal menyimpan', cls: 'text-rose-400' },
  conflict: { text: 'Versi bentrok', cls: 'text-rose-400' }
};

export default function OpsFloorplanStudio() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'superadmin';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('templateId') || searchParams.get('project');
  const editorRef = useRef(null);
  const gridScale = DEFAULT_GRID_SCALE;

  // Project & layer
  const [floorplans, setFloorplans] = useState([]);
  const [fpId, setFpId] = useState('');
  const [fpInfo, setFpInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [layer, setLayer] = useState({ version: 0, updatedBy: null });
  const [elementMeta, setElementMeta] = useState({});
  const [boothRows, setBoothRows] = useState([]);
  const [boothOps, setBoothOps] = useState({});

  // Selection
  const [selectedObject, setSelectedObject] = useState(null);
  // Several Text Box / Bentuk selected together: one "Warna" panel for all of them
  const [selectedShapes, setSelectedShapes] = useState([]);
  const [inspected, setInspected] = useState(null);
  const [opsObjects, setOpsObjects] = useState([]);
  const [boothObjects, setBoothObjects] = useState([]);
  const [warnings, setWarnings] = useState({ conflicts: new Map(), orphans: new Set() });
  const [propertyTick, setPropertyTick] = useState(0);

  // "Perubahan dari Sales"
  const [changes, setChanges] = useState([]);
  const [lastSeenAt, setLastSeenAt] = useState(null);
  const [firstOpen, setFirstOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);

  // Saving
  const [saveStatus, setSaveStatus] = useState('saved');
  const [autoSave, setAutoSave] = useState(() => { try { return localStorage.getItem(AUTOSAVE_KEY) !== 'false'; } catch (e) { return true; } });
  const [exportOpen, setExportOpen] = useState(false);

  // View
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanMode, setIsPanMode] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [toast, setToast] = useState(null);

  const savedSnapshotRef = useRef(null);
  const salesVersionRef = useRef(null);
  const layerVersionRef = useRef(0);
  const boothSummaryRef = useRef(null);
  const isLoadingRef = useRef(false);
  const savingRef = useRef(false);
  const fpIdRef = useRef('');
  const overlayRef = useRef({ boothOps: {}, conflicts: new Map(), orphans: new Set(), inspected: null, focus: null });
  const dragProbeRef = useRef(null);
  const lastMovedRef = useRef(0);
  const autoMergeRef = useRef(true);
  const boothCornerRef = useRef(0);
  const autosaveTimerRef = useRef(null);
  const boothOpsRef = useRef(boothOps);
  boothOpsRef.current = boothOps;
  fpIdRef.current = fpId;

  const showToast = useCallback((msg, ms = 3500) => {
    setToast(msg);
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => setToast(null), ms);
  }, []);

  const getCanvas = () => editorRef.current?.getCanvas();
  const getOps = () => (getCanvas()?.getObjects() || []).filter(o => o.isOpsItem);

  // ---------- serialisation ----------
  // canvas._toObject applies an active multi-selection's transform, so objects inside it keep absolute coordinates
  const serializeOps = () => {
    const canvas = getCanvas();
    return getOps().map(o => ({ object: canvas._toObject(o, 'toObject', OPS_SERIALIZE_PROPS), displayName: captionText(o) }));
  };
  const takeSnapshot = (ops = boothOpsRef.current) => JSON.stringify([serializeOps().map(e => e.object), ops]);

  // ---------- derived state: anchors, conflicts, lists ----------
  const refreshDerived = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas) return 0;
    const ops = getOps();
    const { orphans, moved } = resolveAnchors(canvas, ops);
    const conflicts = findOpsConflicts(canvas, ops);
    overlayRef.current.conflicts = conflicts;
    overlayRef.current.orphans = orphans;
    setWarnings({ conflicts, orphans });
    setOpsObjects([...ops]);
    setBoothObjects(canvas.getObjects().filter(o => o.isBooth && o.boothData));
    // Merged booths and corners look the same as on the sales floorplan; anchored elements keep their original booth
    applyBoothCorners(canvas, boothCornerRef.current);
    refreshMergeRendering(canvas, { enabled: autoMergeRef.current });
    canvas.requestRenderAll();
    return moved;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Called by CanvasEditor after every (re)load, incl. undo/redo: lock & dim the sales layer again
  const applyLayerState = useCallback((canvas) => {
    canvas.getObjects().forEach(obj => {
      if (!obj.isSalesLayer) return;
      if (obj.opsOrigOpacity === undefined) obj.opsOrigOpacity = obj.opacity ?? 1;
      obj.opacity = obj.opsOrigOpacity * SALES_DIM_OPACITY;
      obj.isLocked = true;
      obj.set({
        selectable: false, evented: !obj.isBackgroundBlueprint, hasControls: false, hasBorders: false,
        lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true,
        hoverCursor: 'pointer'
      });
    });
    // Anchored elements follow their booth (booth moved by Sales since the layer was saved)
    const moved = refreshDerived();
    lastMovedRef.current = moved;
    if (moved && !isLoadingRef.current) setPropertyTick(t => t + 1);
  }, [refreshDerived]);

  // ---------- loading ----------
  const loadFloorplan = useCallback(async (id, { keepOps = false } = {}) => {
    if (!id || !editorRef.current) return;
    isLoadingRef.current = true;
    if (!keepOps) { setIsLoading(true); setLoadError(''); }
    const currentOps = keepOps ? serializeOps().map(e => e.object) : null;
    const res = await api.fetchOpsLayer(id, { markSeen: '1' });
    if (!res?.success) {
      isLoadingRef.current = false;
      setIsLoading(false);
      if (!keepOps) setLoadError(res?.error || 'Gagal memuat denah');
      return;
    }
    autoMergeRef.current = res.floorplan?.display?.autoMerge !== false;
    boothCornerRef.current = Number(res.floorplan?.display?.boothCornerPct) || 0;
    const salesObjects = (res.salesCanvas?.objects || []).map(o => ({ ...o, isSalesLayer: true }));
    const opsObjectsJson = currentOps || res.elements.map(e => ({ ...e.object, isOpsItem: true }));
    const combined = { ...res.salesCanvas, objects: [...salesObjects, ...opsObjectsJson] };

    setInspected(null);
    overlayRef.current.inspected = null;
    lastMovedRef.current = 0;
    await editorRef.current.loadHistoryState(combined, res.booths || []); // -> applyLayerState

    setFpId(res.floorplan.id);
    setFpInfo(res.floorplan);
    setBoothRows(res.booths || []);
    setLayer(res.layer || { version: 0 });
    setElementMeta(Object.fromEntries((res.elements || []).map(e => [e.id, { updatedBy: e.updatedBy, updatedAt: e.updatedAt }])));
    salesVersionRef.current = res.floorplan.salesUpdatedAt;
    try { localStorage.setItem(LAST_FP_KEY, res.floorplan.id); } catch (e) {}

    const serverBoothOps = Object.fromEntries((res.boothOps || []).map(b => [b.boothKey, b]));
    if (keepOps) {
      const live = diffBoothSummaries(boothSummaryRef.current, res.boothSummary, { gridScale, at: Date.now() }).map(c => ({ ...c, live: true }));
      if (live.length) {
        setChanges(prev => [...live, ...prev]);
        showToast(`🔔 Denah Sales diperbarui: ${live.length} perubahan booth. Lihat panel "Perubahan dari Sales".`, 5000);
      }
      // Unsaved booth data of this session wins over the server copy
      setBoothOps(prev => ({ ...serverBoothOps, ...prev }));
    } else {
      layerVersionRef.current = res.layer?.version || 0;
      setBoothOps(serverBoothOps);
      boothOpsRef.current = serverBoothOps;
      const opened = diffBoothSummaries(res.previousSummary, res.boothSummary, { gridScale, at: 'open' });
      setChanges(opened);
      setFirstOpen(!res.previousSummary);
      setLastSeenAt(res.lastSeenAt);
      const moved = lastMovedRef.current;
      // Anchored elements that followed a moved booth are saved with their new position
      savedSnapshotRef.current = moved ? null : takeSnapshot(serverBoothOps);
      setSaveStatus(moved ? 'unsaved' : 'saved');
      const conflicts = overlayRef.current.conflicts.size + overlayRef.current.orphans.size;
      setChangesOpen(opened.length > 0 || conflicts > 0);
    }
    boothSummaryRef.current = res.boothSummary;
    isLoadingRef.current = false;
    setIsLoading(false);
    setPropertyTick(t => t + 1);
  }, [refreshDerived, showToast, gridScale]); // eslint-disable-line react-hooks/exhaustive-deps

  // First load: requested project, else last opened, else most recently updated
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await api.fetchOpsFloorplans();
      if (cancelled) return;
      setFloorplans(list);
      let last = null;
      try { last = localStorage.getItem(LAST_FP_KEY); } catch (e) {}
      const target = [requestedId, last].find(id => id && list.some(f => f.id === id)) || list[0]?.id;
      if (!target) { setIsLoading(false); setLoadError('Belum ada denah sales. Minta tim Sales membuat denah terlebih dahulu.'); return; }
      for (let i = 0; i < 20 && !editorRef.current?.getCanvas(); i++) await new Promise(r => setTimeout(r, 100));
      if (!cancelled) loadFloorplan(target);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchFloorplan = async (id) => {
    if (!id || id === fpId) return;
    if (saveStatus === 'unsaved' && !window.confirm('Ada perubahan lapisan operasional yang belum disimpan. Pindah denah tanpa menyimpan?')) return;
    setSearchParams({ templateId: id });
    setSelectedObject(null);
    await loadFloorplan(id);
  };

  // ---------- canvas events ----------
  useEffect(() => {
    let canvas = null;
    let timer = null;
    const handlers = {};
    const attach = () => {
      canvas = getCanvas();
      if (!canvas) { timer = setTimeout(attach, 100); return; }

      // Anything created in this mode belongs to the operational layer and is internal until an admin publishes it
      handlers.added = ({ target }) => {
        if (!target || target.isSalesLayer || target.isOpsItem || target.isBackgroundBlueprint || target.isGridLine) return;
        target.isOpsItem = true;
        if (target.venueData) target.venueData.publicVisible = false;
      };
      handlers.modified = () => {
        const el = canvas.getActiveObject();
        const targets = el?.type?.toLowerCase() === 'activeselection' ? el.getObjects() : [el];
        const booths = canvas.getObjects().filter(o => o.isBooth && o.boothData);
        targets.forEach(t => {
          if (!t?.isOpsItem || !t.venueData?.anchor) return;
          const booth = findAnchorBooth(t.venueData.anchor, booths);
          if (booth) t.venueData.anchor = captureAnchor(t, booth);
        });
        setTimeout(refreshDerived, 0);
      };
      handlers.removed = () => { if (!isLoadingRef.current) setTimeout(refreshDerived, 0); };
      handlers.down = (opt) => {
        const t = opt.target;
        if (t?.isSalesLayer) {
          setInspected(t);
          overlayRef.current.inspected = t;
          dragProbeRef.current = { x: opt.e.clientX, y: opt.e.clientY, shown: false };
          canvas.requestRenderAll();
        } else {
          dragProbeRef.current = null;
          if (overlayRef.current.inspected) {
            overlayRef.current.inspected = null;
            setInspected(null);
            canvas.requestRenderAll();
          }
        }
      };
      handlers.move = (opt) => {
        const probe = dragProbeRef.current;
        if (!probe || probe.shown || !(opt.e.buttons > 0)) return;
        if (Math.hypot(opt.e.clientX - probe.x, opt.e.clientY - probe.y) > 6) {
          probe.shown = true;
          showToast(`🔒 ${OPS_LOCK_MESSAGE}`, 4500);
        }
      };
      handlers.up = () => { dragProbeRef.current = null; };
      handlers.render = ({ ctx }) => drawOpsOverlay(canvas, ctx || canvas.getContext(), overlayRef.current);

      // A CCTV viewing cone covers booths: only the camera itself is clickable, so booths under the cone stay clickable
      if (!canvas.__opsHitPatched) {
        const checkTarget = canvas._checkTarget.bind(canvas);
        canvas._checkTarget = (obj, pointer) => {
          if (!checkTarget(obj, pointer)) return false;
          return hasWideDrawing(obj) ? pointInPolygon(pointer, footprintPolygon(obj)) : true;
        };
        canvas.__opsHitPatched = true;
      }

      canvas.on('object:added', handlers.added);
      canvas.on('object:modified', handlers.modified);
      canvas.on('object:removed', handlers.removed);
      canvas.on('mouse:down', handlers.down);
      canvas.on('mouse:move', handlers.move);
      canvas.on('mouse:up', handlers.up);
      canvas.on('after:render', handlers.render);
    };
    attach();
    return () => {
      clearTimeout(timer);
      if (!canvas) return;
      canvas.off('object:added', handlers.added);
      canvas.off('object:modified', handlers.modified);
      canvas.off('object:removed', handlers.removed);
      canvas.off('mouse:down', handlers.down);
      canvas.off('mouse:move', handlers.move);
      canvas.off('mouse:up', handlers.up);
      canvas.off('after:render', handlers.render);
    };
  }, [refreshDerived, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    overlayRef.current.boothOps = boothOps;
    getCanvas()?.requestRenderAll();
  }, [boothOps]);

  // ---------- saving (operational layer only) ----------
  const handleSave = useCallback(async ({ silent = false } = {}) => {
    if (!fpIdRef.current || savingRef.current || isLoadingRef.current) return;
    savingRef.current = true;
    setSaveStatus('saving');
    const elements = serializeOps();
    const opsData = boothOpsRef.current;
    const snapshot = JSON.stringify([elements.map(e => e.object), opsData]);
    const res = await api.saveOpsLayer(fpIdRef.current, { baseVersion: layerVersionRef.current, elements, boothOps: Object.values(opsData) });
    savingRef.current = false;
    if (res?.success) {
      layerVersionRef.current = res.version;
      savedSnapshotRef.current = snapshot;
      setLayer({ version: res.version, updatedBy: res.updatedBy, updatedAt: res.updatedAt });
      setSaveStatus(takeSnapshot() === snapshot ? 'saved' : 'unsaved');
      if (!silent) showToast('💾 Lapisan operasional tersimpan');
      return;
    }
    if (res?.status === 409 || res?.code === 'OPS_VERSION_CONFLICT') {
      setSaveStatus('conflict');
      showToast(`⚠️ ${res.error}`, 7000);
      return;
    }
    setSaveStatus('error');
    showToast(`⚠️ Gagal menyimpan lapisan operasional: ${res?.error || 'server tidak merespons'}`, 6000);
  }, [showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Ada perubahan" / "Tersimpan" for the operational layer, with optional auto-save
  useEffect(() => {
    if (isLoadingRef.current || !fpId || saveStatus === 'saving' || saveStatus === 'conflict') return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (isLoadingRef.current || savingRef.current) return;
      const snap = takeSnapshot();
      if (snap === savedSnapshotRef.current) { setSaveStatus('saved'); return; }
      if (autoSave) handleSave({ silent: true });
      else setSaveStatus('unsaved');
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(autosaveTimerRef.current);
  }, [opsObjects, boothOps, propertyTick, autoSave, fpId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { try { localStorage.setItem(AUTOSAVE_KEY, String(autoSave)); } catch (e) {} }, [autoSave]);

  // ---------- live sync with the sales floorplan ----------
  useEffect(() => {
    if (!fpId) return;
    const timer = setInterval(async () => {
      if (isLoadingRef.current || savingRef.current || document.hidden) return;
      const v = await api.fetchOpsVersion(fpIdRef.current);
      if (!v?.success) return;
      if (v.salesUpdatedAt !== salesVersionRef.current) {
        // Booths moved / resized / added / removed / re-assigned by Sales: reload the sales layer, keep our layer
        await loadFloorplan(fpIdRef.current, { keepOps: true });
      } else if (v.opsVersion !== layerVersionRef.current) {
        if (takeSnapshot() === savedSnapshotRef.current) {
          await loadFloorplan(fpIdRef.current);
          showToast(`🔄 Lapisan operasional diperbarui oleh ${v.opsUpdatedBy || 'pengguna lain'}`);
        } else if (saveStatus !== 'conflict') {
          setSaveStatus('conflict');
          showToast(`⚠️ ${v.opsUpdatedBy || 'Pengguna lain'} baru saja menyimpan lapisan operasional. Muat ulang sebelum menyimpan agar tidak menimpa perubahannya.`, 7000);
        }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fpId, loadFloorplan, saveStatus, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- actions ----------
  const focusPoint = (x, y) => {
    editorRef.current?.focusPoint(x, y, Math.max(zoomLevel, 1.5));
    overlayRef.current.focus = { x, y, at: Date.now() };
    const canvas = getCanvas();
    let n = 0;
    const tick = setInterval(() => { canvas?.requestRenderAll(); if (++n > 40) clearInterval(tick); }, 65);
  };
  const focusElement = (el) => {
    if (!el?.canvas) return;
    const c = objectCenterOf(el);
    focusPoint(c.x, c.y);
    editorRef.current?.selectObject(el);
  };

  const recordAnchorChange = () => {
    editorRef.current?.recordChange();
    refreshDerived();
    setPropertyTick(t => t + 1);
  };
  const anchorTo = (code) => {
    const el = selectedObject;
    const booth = boothObjects.find(b => b.boothData.code === code);
    if (!el || !booth) return;
    el.venueData.anchor = captureAnchor(el, booth);
    delete el.venueData.anchorOrphaned;
    recordAnchorChange();
    showToast(`🔗 ${captionText(el)} ditempel ke booth ${code}`);
  };
  const autoAnchor = () => {
    const el = selectedObject;
    const booth = el && boothUnder(el, getCanvas());
    if (!booth) { showToast('⚠️ Elemen tidak berada di atas booth mana pun. Geser elemen ke dalam booth atau pilih booth dari daftar.'); return; }
    anchorTo(booth.boothData.code);
  };
  const detach = () => {
    const el = selectedObject;
    if (!el) return;
    delete el.venueData.anchor;
    delete el.venueData.anchorOrphaned;
    recordAnchorChange();
  };
  const togglePublic = () => {
    if (!isAdmin || !selectedObject) return;
    selectedObject.venueData.publicVisible = !selectedObject.venueData.publicVisible;
    recordAnchorChange();
  };

  const updateBoothOps = (booth, patch) => {
    const key = boothKeyOf(booth.boothData);
    setBoothOps(prev => ({ ...prev, [key]: { ...(prev[key] || emptyBoothOps(booth.boothData)), boothCode: booth.boothData.code || '', ...patch } }));
  };

  const handleExport = async (format) => {
    setExportOpen(false);
    const canvas = getCanvas();
    if (!canvas) return;
    const prevInspected = overlayRef.current.inspected;
    overlayRef.current.inspected = null;
    try {
      await exportOpsFloorplan(canvas, { title: fpInfo?.title || 'Denah', venue: fpInfo?.venue || '', format, opsObjects: getOps(), boothOps });
      showToast(`📥 Denah Operasional diunduh (${format.toUpperCase()})`);
    } catch (e) {
      showToast(`⚠️ Gagal export: ${e.message}`);
    } finally {
      overlayRef.current.inspected = prevInspected;
      canvas.requestRenderAll();
    }
  };

  const handleSelectionChange = useCallback((active, actives = []) => {
    setSelectedObject(active && active.isOpsItem ? active : null);
    setSelectedShapes(actives.length > 1 ? actives.filter(o => o.isOpsItem && isShapeElement(o)) : []);
    if (active) {
      overlayRef.current.inspected = null;
      setInspected(null);
    }
  }, []);

  const boothCodes = useMemo(() => boothObjects.map(b => b.boothData.code).filter(Boolean).sort((a, b) => a.localeCompare(b, 'id', { numeric: true })), [boothObjects]);
  const warningCount = warnings.conflicts.size + warnings.orphans.size;
  const saveLabel = SAVE_LABELS[saveStatus] || SAVE_LABELS.saved;

  // ---------- right panel ----------
  const renderInspector = () => {
    if (selectedShapes.length > 1) {
      return (
        <aside className="w-80 lg:w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-10 select-none overflow-y-auto overflow-x-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-800 text-sm">{selectedShapes.length} Text Box / Bentuk dipilih</h2>
            <p className="text-xs text-slate-500 mt-1">Atur warna semuanya sekaligus.</p>
          </div>
          <div className="p-4">
            <ShapeStyleSection elements={selectedShapes} onApply={(style) => { editorRef.current?.applyShapeStyle(style); setPropertyTick(t => t + 1); }} />
          </div>
        </aside>
      );
    }
    if (selectedObject?.isOpsItem && selectedObject.canvas) {
      const extra = (
        <OpsElementSection
          element={selectedObject}
          boothCodes={boothCodes}
          conflictCodes={warnings.conflicts.get(selectedObject) || null}
          isAdmin={isAdmin}
          meta={elementMeta[selectedObject.venueData?.id]}
          onAnchor={anchorTo}
          onDetach={detach}
          onAutoAnchor={autoAnchor}
          onTogglePublic={togglePublic}
        />
      );
      return (
        <PropertyPanel
          key={selectedObject.venueData?.id || 'ops'}
          selectedObject={selectedObject}
          selectedObjects={[selectedObject]}
          currentFloorplanId={fpId}
          canvasObjects={opsObjects}
          showCaptions={showCaptions}
          extraTop={extra}
          hidePublicToggle
          propertyTick={propertyTick}
          onUpdateProperty={(props) => { editorRef.current?.updateActiveProperty(props); setPropertyTick(t => t + 1); setTimeout(refreshDerived, 0); }}
          onApplyShapeStyle={(style) => { editorRef.current?.applyShapeStyle(style); setPropertyTick(t => t + 1); }}
          onDeleteSelected={() => { editorRef.current?.deleteSelected(); setSelectedObject(null); }}
          onDuplicateSelected={() => editorRef.current?.duplicateSelected()}
          onBringForward={() => editorRef.current?.bringForward()}
          onSendBackward={() => editorRef.current?.sendBackward()}
        />
      );
    }
    if (inspected?.isBooth && inspected.boothData) {
      const key = boothKeyOf(inspected.boothData);
      const row = boothRows.find(r => (r.id && r.id === inspected.boothData.id) || r.code === inspected.boothData.code);
      const anchored = opsObjects.filter(o => o.venueData?.anchor && findAnchorBooth(o.venueData.anchor, [inspected]));
      return (
        <OpsInspector
          view="booth"
          booth={inspected}
          boothRow={row}
          data={boothOps[key] || emptyBoothOps(inspected.boothData)}
          onChange={(patch) => updateBoothOps(inspected, patch)}
          anchored={anchored}
          onSelectElement={focusElement}
        />
      );
    }
    if (inspected) return <OpsInspector view="sales" obj={inspected} />;
    return (
      <OpsInspector
        view="summary"
        opsObjects={opsObjects}
        booths={boothObjects}
        boothOps={boothOps}
        conflicts={warnings.conflicts}
        orphans={warnings.orphans}
        layer={layer}
        onFocusElement={focusElement}
      />
    );
  };

  return (
    <div className="flex flex-col h-screen w-full min-w-0 max-w-full overflow-hidden bg-slate-900 font-sans relative">
      {/* Header: Mode Operasional */}
      <header className="h-14 shrink-0 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 px-4 text-white select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0"><HardHat size={18} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">Floorplan Studio</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-extrabold tracking-wider">MODE OPERASIONAL</span>
            </div>
            <div className="relative flex items-center gap-1 text-[11px] text-slate-400">
              <select value={fpId} onChange={(e) => switchFloorplan(e.target.value)} disabled={isLoading}
                className="bg-transparent text-slate-200 font-semibold pr-4 focus:outline-none cursor-pointer max-w-[260px] truncate appearance-none" title="Pilih denah / project">
                {floorplans.map(f => <option key={f.id} value={f.id} className="text-slate-900">{f.title}{f.status === 'published' ? ' (Live)' : ''}</option>)}
              </select>
              <ChevronDown size={12} className="-ml-4 pointer-events-none" />
              {fpInfo?.venue && <span className="truncate">• {fpInfo.venue}</span>}
            </div>
          </div>
          {isAdmin && (
            <div className="hidden lg:flex items-center bg-slate-900 border border-slate-700 rounded-xl p-0.5 ml-2">
              <button type="button" onClick={() => navigate(`/admin/floorplan${fpId ? `?templateId=${encodeURIComponent(fpId)}` : ''}`)}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white flex items-center gap-1"><MapIcon size={12} /> Denah Sales</button>
              <span className="px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-500 text-slate-950 flex items-center gap-1"><HardHat size={12} /> Denah Operasional</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => setChangesOpen(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border ${changesOpen ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'}`}>
            <History size={14} /> Perubahan dari Sales
            {(changes.length + warningCount) > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${warningCount ? 'bg-rose-500' : 'bg-indigo-400'}`}>{changes.length + warningCount}</span>}
          </button>

          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg">
            <span className={`px-2.5 text-[11px] font-semibold ${saveLabel.cls}`} title="Status penyimpanan lapisan operasional">{saveLabel.text}</span>
            {saveStatus === 'conflict' ? (
              <button type="button" onClick={() => loadFloorplan(fpId)} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-r-lg text-xs font-semibold flex items-center gap-1.5">
                <RefreshCw size={13} /> Muat Ulang
              </button>
            ) : (
              <button type="button" onClick={() => handleSave()} disabled={saveStatus === 'saving' || isLoading}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                {saveStatus === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Simpan
              </button>
            )}
            {saveStatus !== 'conflict' && (
              <button type="button" onClick={() => setAutoSave(v => !v)} title="Simpan otomatis lapisan operasional"
                className={`px-2 py-1.5 rounded-r-lg text-[10px] font-bold flex items-center gap-0.5 ${autoSave ? 'text-emerald-300' : 'text-slate-500'}`}>
                <Zap size={11} /> Auto
              </button>
            )}
          </div>

          <div className="relative">
            <button type="button" onClick={() => setExportOpen(v => !v)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <Download size={13} /> Export
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-1 z-50 w-60 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 text-[10px] text-slate-500 border-b border-slate-100">Booth + elemen operasional + legenda, tanpa harga</div>
                  <button type="button" onClick={() => handleExport('pdf')} className="w-full px-3 py-2 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2"><FileText size={14} className="text-rose-600" /> Unduh PDF (A3)</button>
                  <button type="button" onClick={() => handleExport('png')} className="w-full px-3 py-2 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2"><FileImage size={14} className="text-indigo-600" /> Unduh Gambar (PNG)</button>
                </div>
              </>
            )}
          </div>

          <button type="button" onClick={() => setIsPreviewMode(v => !v)} title="Pratinjau"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border ${isPreviewMode ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'}`}>
            {isPreviewMode ? <EyeOff size={13} /> : <Eye size={13} />} Pratinjau
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative w-full min-w-0">
        {!isPreviewMode && (
          <ToolSidebar
            mode="ops"
            onAddVenueItem={(type) => editorRef.current?.addVenueItem(type)}
            onAddLibraryElement={(type) => editorRef.current?.addLibraryElement(type)}
            onToggleLayerVisibility={(obj) => editorRef.current?.toggleObjectVisibility(obj)}
            onToggleLayerLock={(obj) => editorRef.current?.toggleObjectLock(obj)}
            objectsList={opsObjects}
            onSelectObject={(obj) => editorRef.current?.selectObject(obj)}
            onDeleteObject={(obj) => {
              const canvas = getCanvas();
              if (canvas && obj?.isOpsItem) {
                canvas.remove(obj);
                editorRef.current?.recordChange();
                setSelectedObject(null);
              }
            }}
            activeObjectId={selectedObject?.venueData?.id}
            selectedObject={selectedObject}
            onUpdateProperty={(props) => editorRef.current?.updateActiveProperty(props)}
            propertyTick={propertyTick}
            gridScale={gridScale}
            currentFloorplanId={fpId}
          />
        )}

        <main className="flex-1 min-w-0 relative h-full overflow-hidden flex flex-col">
          <CanvasEditor
            ref={editorRef}
            onWarning={(msg) => { if (!/pilar/i.test(msg)) showToast(msg); }}
            onSelectionChange={handleSelectionChange}
            onObjectsUpdate={(objs) => setOpsObjects(objs.filter(o => o.isOpsItem))}
            onStateLoaded={applyLayerState}
            hidePrices
            snapToGrid={snapToGrid}
            showGrid={showGrid}
            showRuler={showRuler}
            showDimensions={showDimensions}
            showCaptions={showCaptions}
            gridScale={gridScale}
            isPanMode={isPanMode}
            zoomLevel={zoomLevel}
            onZoomChange={setZoomLevel}
            blueprintData={null}
            isPreviewMode={isPreviewMode}
            onHistoryChange={setHistoryState}
          />

          {changesOpen && !isPreviewMode && (
            <SalesChangesPanel
              changes={changes}
              conflicts={warnings.conflicts}
              orphans={warnings.orphans}
              lastSeenAt={lastSeenAt}
              firstOpen={firstOpen}
              onFocus={(c) => focusPoint(c.x, c.y)}
              onFocusElement={focusElement}
              onClear={() => setChanges([])}
              onClose={() => setChangesOpen(false)}
            />
          )}

          {(isLoading || loadError) && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
              <div className="bg-white rounded-xl shadow-xl px-5 py-4 text-sm text-slate-700 flex items-center gap-2 max-w-sm">
                {loadError ? <><AlertTriangle size={16} className="text-rose-600 shrink-0" /> {loadError}</> : <><Loader2 size={16} className="animate-spin" /> Memuat denah operasional…</>}
              </div>
            </div>
          )}

          {!isPreviewMode && (
            <CanvasBottomBar
              zoomLevel={zoomLevel}
              onZoomIn={() => editorRef.current?.setZoomLevel(Math.min(zoomLevel * 1.2, 5))}
              onZoomOut={() => editorRef.current?.setZoomLevel(Math.max(zoomLevel / 1.2, 0.2))}
              onZoomReset={() => editorRef.current?.resetZoom()}
              onZoomFit={() => editorRef.current?.fitToScreen()}
              isPanMode={isPanMode}
              onTogglePanMode={() => setIsPanMode(v => !v)}
              snapToGrid={snapToGrid}
              onToggleSnapToGrid={() => setSnapToGrid(v => !v)}
              showGrid={showGrid}
              onToggleShowGrid={() => setShowGrid(v => !v)}
              showRuler={showRuler}
              onToggleShowRuler={() => setShowRuler(v => !v)}
              showDimensions={showDimensions}
              onToggleShowDimensions={() => setShowDimensions(v => !v)}
              showCaptions={showCaptions}
              onToggleShowCaptions={() => setShowCaptions(v => !v)}
              gridScale={gridScale}
              canUndo={historyState.canUndo}
              canRedo={historyState.canRedo}
              onUndo={() => editorRef.current?.undo()}
              onRedo={() => editorRef.current?.redo()}
              isMultiSelection={false}
              isGroupSelection={false}
            />
          )}
        </main>

        {!isPreviewMode && renderInspector()}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[80] bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-slate-700 max-w-md animate-fadeIn">
          {toast}
        </div>
      )}
    </div>
  );
}
