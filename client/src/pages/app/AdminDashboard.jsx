import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as fabric from 'fabric';
import TopNavbar from '../../components/admin/TopNavbar';
import ToolSidebar from '../../components/admin/ToolSidebar';
import CanvasEditor from '../../components/admin/CanvasEditor';
import PropertyPanel from '../../components/admin/PropertyPanel';
import BlueprintModal from '../../components/admin/BlueprintModal';
import ExportModal from '../../components/admin/ExportModal';
import PublishModal from '../../components/admin/PublishModal';
import TemplateManagerModal from '../../components/admin/TemplateManagerModal';
import NewTemplateModal from '../../components/admin/NewTemplateModal';
import InvoiceModal from '../../components/admin/InvoiceModal';
import InvoiceEditorModal from '../../components/admin/InvoiceEditorModal';
import BookingModal from '../../components/public/BookingModal';
import SalesBoothActions from '../../components/admin/SalesBoothActions';
import { readDraft, dropDraft } from '../../utils/localDraft';
import { friendlyError } from '../../utils/safeStorage';
import CanvasBottomBar from '../../components/admin/CanvasBottomBar';
import ShapePalette from '../../components/admin/ShapePalette';
import CategoryTierModal from '../../components/admin/CategoryTierModal';
import CreateHallModal from '../../components/admin/CreateHallModal';
import { exportFloorplanToPdf } from '../../utils/floorplanPdfExport';
import { exportToPRDJson, DEFAULT_GRID_SCALE, updateBoothCategoriesRegistry, updateBoothAppearance, hydrateBoothObject, applyBoothCorners, clampCornerPct } from '../../utils/floorplanUtils';
import { generatePresetFloorplanData } from '../../utils/presetLayouts';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import TemplatePriceSyncModal from '../../components/admin/TemplatePriceSyncModal';
import { canSyncTemplatePrices } from '../../utils/templatePrice';
import { canEditFloorplan, canRegisterTenant } from '../../utils/roles';
import { resolveAnchors } from '../../utils/opsLayer';
import { refreshMergeRendering } from '../../utils/boothMerge';


// Custom Fabric properties persisted with the canvas (see AGENTS.md §1)
const CANVAS_SERIALIZE_PROPS = ['isBooth', 'boothData', 'isVenueItem', 'venueData', 'isCustomGroup', 'isBackgroundBlueprint', 'blueprintData', 'strokeUniform', 'noScaleCache', 'id', 'name', 'src', 'isLocked', 'isBasicShape', 'shapeType'];
const AUTOSAVE_DELAY_MS = 2500;
const AUTOSAVE_PREF_KEY = 'studio_autosave_enabled';

const OPS_OVERLAY_PREF_KEY = 'studio_show_ops_layer';

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetTemplateId = searchParams.get('templateId') || searchParams.get('project');
  const editorRef = useRef(null);

  // Active Floorplan / Template Identity
  const [currentFloorplanId, setCurrentFloorplanId] = useState('');
  const [currentFloorplanTitle, setCurrentFloorplanTitle] = useState('Kanvas Baru');
  const [currentFloorplanVenue, setCurrentFloorplanVenue] = useState('');
  const [currentFloorplanStatus, setCurrentFloorplanStatus] = useState('draft');

  // Canvas Selection & Objects state
  const [selectedObject, setSelectedObject] = useState(null);
  const [selectedObjects, setSelectedObjects] = useState([]);
  const [allCanvasObjects, setAllCanvasObjects] = useState([]);

  // Precision, Grid & Dynamic Scale Controls
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);
  // "Tampilkan Semua Caption": saved per floorplan in metadata.display.showCaptions (Live follows it)
  const [showCaptions, setShowCaptions] = useState(true);
  const captionsFromMeta = (meta) => meta?.display?.showCaptions !== false;
  // Auto-merge booth for this project (metadata.display.autoMerge, AGENTS.md §18) + current merge groups
  const [autoMerge, setAutoMerge] = useState(true);
  const autoMergeFromMeta = (meta) => meta?.display?.autoMerge !== false;
  const [mergeGroups, setMergeGroups] = useState([]);
  // "Sudut Booth" of this floorplan (metadata.display.boothCornerPct, default 0 = siku). The ref is read while a
  // canvas loads (onStateLoaded), before React state catches up.
  const [boothCornerPct, setBoothCornerPctState] = useState(0);
  const boothCornerRef = useRef(0);
  const cornerFromMeta = (meta) => clampCornerPct(meta?.display?.boothCornerPct ?? 0);
  const setBoothCornerPct = (value) => {
    const pct = clampCornerPct(value);
    boothCornerRef.current = pct;
    setBoothCornerPctState(pct);
  };
  // Booth snapping (Floorplan Studio only)
  const [snapToBooths, setSnapToBooths] = useState(true);
  const [snapToWalls, setSnapToWalls] = useState(false);
  const [snapToElements, setSnapToElements] = useState(true);
  const gridScale = DEFAULT_GRID_SCALE; // 1 kotak = 1 meter (default 20px)

  // Viewport & Pan state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanMode, setIsPanMode] = useState(false);
  const [previewToggled, setIsPreviewMode] = useState(false);
  // Sales: the Studio is read-only (the "preview" canvas: nothing can be moved, drawn or saved); a click on an
  // empty booth opens the registration form. Only the Super Admin edits the floorplan.
  const readOnlyStudio = !canEditFloorplan(user?.role);
  const isPreviewMode = previewToggled || readOnlyStudio;
  // Operations edits the floorplan but never registers / changes a tenant (tenant, status and discount are read-only)
  const tenantLocked = !canRegisterTenant(user?.role);
  const TENANT_LOCKED_MSG = 'Role Operasional tidak dapat mendaftarkan atau mengubah tenant / brand.';
  // Read-only Studio (Sales): the booth whose action pop up is open ({ booth, anchor: click position on the screen })
  const salesActions = readOnlyStudio && !tenantLocked;
  const [actionBooth, setActionBooth] = useState(null);
  const closeBoothActions = useCallback(() => setActionBooth(null), []);
  // The server's booth data after an action (booking, discount, invoice): repaint that booth, no page reload. The
  // read-only Studio never saves the canvas; the server already wrote the same change into the floorplan.
  const applyServerBooth = useCallback((b) => {
    const canvas = editorRef.current?.getCanvas();
    if (!canvas || !b?.code) return;
    const obj = canvas.getObjects().find(o => o.boothData && (o.boothData.code || o.boothData.booth_number) === b.code);
    if (!obj) return;
    const d = obj.boothData;
    const next = {
      status: b.status, ownerName: b.ownerName, picName: b.picName, email: b.email, phone: b.phone, brandCategory: b.brandCategory,
      exhibitorId: b.exhibitorId, // auto-merge groups adjacent booths of one exhibitor (§18)
      price: b.price, discountType: b.discountType, discountValue: b.discountValue, discountAmount: b.discountAmount, discountReason: b.discountReason
    };
    if (Object.keys(next).every(k => (d[k] ?? '') === (next[k] ?? ''))) return;
    updateBoothAppearance(obj, next);
    obj.dirty = true;
    canvas.requestRenderAll();
    setActionBooth(prev => (prev && prev.booth?.code === b.code ? { ...prev, booth: { ...prev.booth, ...next } } : prev));
    setPropertyTick(t => t + 1);
  }, []);

  // History (Undo / Redo) state
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  // Blueprint state
  const [blueprintData, setBlueprintData] = useState(null);
  const [isBlueprintOpen, setIsBlueprintOpen] = useState(false);

  // Modals state
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isNewTemplateOpen, setIsNewTemplateOpen] = useState(false);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoriesVersion, setCategoriesVersion] = useState(0);
  const [activeInvoiceBooth, setActiveInvoiceBooth] = useState(null);
  const [activeBookingBooth, setActiveBookingBooth] = useState(null);
  const [bookingModalConfig, setBookingModalConfig] = useState({
    isOpen: false,
    booth: null,
    mode: 'register',
    initialData: null
  });
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  // Public link (/live/<slug>) of the open floorplan while it is published
  const [currentPublicSlug, setCurrentPublicSlug] = useState(null);
  const [isCreateHallOpen, setIsCreateHallOpen] = useState(false);
  const [allEvents, setAllEvents] = useState([]);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [siblingHalls, setSiblingHalls] = useState([]);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved'
  // Auto-save is on by default and the choice is remembered per browser
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    try { return localStorage.getItem(AUTOSAVE_PREF_KEY) !== 'false'; } catch (e) { return true; }
  });
  const autoSaveTimerRef = useRef(null);
  const isInitialLoadedRef = useRef(false);
  // Snapshot of what is stored on the server; auto-save only fires when the editor differs from it
  const lastSavedSnapshotRef = useRef(null);
  const latestEditorMetaRef = useRef({});

  // Toast message
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [propertyTick, setPropertyTick] = useState(0);

  // "Tampilkan Lapisan Operasional": the operations team's layer drawn read-only on top of the sales floorplan.
  // Overlay objects are excludeFromExport + isOpsOverlay, so they are never saved into the sales canvas.
  const [showOpsLayer, setShowOpsLayer] = useState(() => { try { return localStorage.getItem(OPS_OVERLAY_PREF_KEY) === 'true'; } catch (e) { return false; } });
  const [opsOverlayTick, setOpsOverlayTick] = useState(0);
  const opsOverlaySeqRef = useRef(0);
  useEffect(() => { try { localStorage.setItem(OPS_OVERLAY_PREF_KEY, String(showOpsLayer)); } catch (e) {} }, [showOpsLayer]);

  // Load Booth Categories & Price Tiers from backend SQLite on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await api.fetchCategories();
        if (cats && Array.isArray(cats) && cats.length > 0) {
          updateBoothCategoriesRegistry(cats);
          setCategoriesVersion(v => v + 1);
        }
      } catch (err) {
        console.warn('Gagal memuat kategori tier pada mount:', err);
      }
    };
    loadCategories();
  }, []);

  const handleCategoriesUpdated = (cats) => {
    updateBoothCategoriesRegistry(cats);
    // Booths that follow their template take the new template price (the server did the same in the database, §32)
    const followed = readOnlyStudio ? 0 : editorRef.current?.refreshTemplatePrices() || 0;
    if (followed) showToast(`💰 ${followed} booth mengikuti harga template yang baru`);
    setCategoriesVersion(v => v + 1);
    setPropertyTick(t => t + 1);
  };

  // "Samakan Semua Harga dengan Template": the preview compares what is SAVED, so pending edits are saved first
  const [isPriceSyncOpen, setIsPriceSyncOpen] = useState(false);
  const openPriceSync = async () => {
    if (!currentFloorplanId) return showToast('⚠️ Simpan denah ini dulu sebelum menyamakan harga');
    const saved = await handleSaveDraft(false, { silent: true });
    if (saved?.success === false) return;
    setIsPriceSyncOpen(true);
  };

  // Admin open booking with options (register or edit)
  const handleOpenBooking = (boothData, options = {}) => {
    if (tenantLocked) { showToast(TENANT_LOCKED_MSG); return; }
    setActiveBookingBooth(boothData);
    setBookingModalConfig({
      isOpen: true,
      booth: boothData,
      mode: options.mode || 'register',
      initialData: options.initialData || null
    });
  };

  // Admin updated tenant biodata
  const handleTenantBiodataUpdated = (updated) => {
    const targetCode = updated.boothCode;
    const targetId = updated.boothId;

    const canvas = editorRef.current?.getCanvas();
    if (canvas) {
      const targetObj = canvas.getObjects().find(o => 
        (o.isBooth || o.boothData) && 
        ((targetId && o.boothData?.id === targetId) || (targetCode && (o.boothData?.code === targetCode || o.boothData?.booth_number === targetCode)))
      );
      if (targetObj && targetObj.boothData) {
        updateBoothAppearance(targetObj, {
          ownerName: updated.brandName || '',
          picName: updated.fullName || '',
          email: updated.email || '',
          phone: updated.phone || '',
          category: updated.brandCategory || targetObj.boothData.category,
          brandCategory: updated.brandCategory || targetObj.boothData.brandCategory
        });
        targetObj.dirty = true;
        canvas.requestRenderAll();
      }
    }

    editorRef.current?.updateActiveProperty({
      ownerName: updated.brandName || '',
      picName: updated.fullName || '',
      email: updated.email || '',
      phone: updated.phone || '',
      brandCategory: updated.brandCategory || ''
    });
    editorRef.current?.saveState?.();
    setPropertyTick((t) => t + 1);

    handleSaveDraft(currentFloorplanStatus === 'published', { silent: true });
    showToast(`Biodata Booth ${targetCode} berhasil diperbarui.`);
    setBookingModalConfig(prev => ({ ...prev, isOpen: false }));
    setActiveBookingBooth(null);
  };

  // Admin detached tenant from booth
  const handleDetachTenant = async (boothData) => {
    if (tenantLocked) { showToast(TENANT_LOCKED_MSG); return; }
    const targetCode = boothData.code || boothData.booth_number;
    const targetId = boothData.id;
    try {
      const res = await api.detachTenantFromBooth({
        floorplanId: currentFloorplanId,
        boothId: targetId,
        boothCode: targetCode,
        adminName: 'Admin'
      });
      if (res && res.success) {
        const canvas = editorRef.current?.getCanvas();
        if (canvas) {
          const targetObj = canvas.getObjects().find(o => 
            (o.isBooth || o.boothData) && 
            ((targetId && o.boothData?.id === targetId) || (targetCode && (o.boothData?.code === targetCode || o.boothData?.booth_number === targetCode)))
          );
          if (targetObj && targetObj.boothData) {
            updateBoothAppearance(targetObj, {
              status: 'available',
              ownerName: '',
              picName: '',
              email: '',
              phone: '',
              registrationSource: null,
              registeredBy: null
            });
            targetObj.dirty = true;
            canvas.requestRenderAll();
          }
        }

        editorRef.current?.updateActiveProperty({
          status: 'available',
          ownerName: '',
          picName: '',
          email: '',
          phone: '',
          registrationSource: null,
          registeredBy: null
        });
        editorRef.current?.saveState?.();
        setPropertyTick((t) => t + 1);
        handleSaveDraft(currentFloorplanStatus === 'published', { silent: true });
        showToast(`Tenant dilepas dari Booth ${targetCode}. Status kembali ke Available.`);
      } else {
        alert(res?.error || 'Gagal melepas tenant dari booth');
      }
    } catch (err) {
      console.error('Error detaching tenant:', err);
      alert('Terjadi kesalahan saat melepas tenant');
    }
  };

  // Admin booking success handler
  const handleAdminBookingSuccess = (bookingData) => {
    const isReservedOnly = bookingData.bookingType === 'booking' || bookingData.bookingType === 'manual_transfer';
    const targetStatus = isReservedOnly ? 'reserved' : 'sold';
    const targetCode = bookingData.boothCode || bookingModalConfig.booth?.code || activeBookingBooth?.code;
    const targetId = bookingData.boothId || bookingModalConfig.booth?.id || activeBookingBooth?.id;

    const canvas = editorRef.current?.getCanvas();
    if (canvas) {
      const targetObj = canvas.getObjects().find(o => 
        (o.isBooth || o.boothData) && 
        ((targetId && o.boothData?.id === targetId) || (targetCode && (o.boothData?.code === targetCode || o.boothData?.booth_number === targetCode)))
      );
      if (targetObj && targetObj.boothData) {
        // Universal visual & metadata update (updates background Rect, colors, texts, and marks dirty)
        updateBoothAppearance(targetObj, {
          status: targetStatus,
          ownerName: bookingData.brandName || '',
          picName: bookingData.fullName || '',
          email: bookingData.email || '',
          phone: bookingData.phone || '',
          category: bookingData.brandCategory || targetObj.boothData.category,
          brandCategory: bookingData.brandCategory || targetObj.boothData.brandCategory,
          registrationSource: bookingData.source || 'admin',
          registeredBy: bookingData.adminName || 'Admin'
        });
        targetObj.dirty = true;
        canvas.requestRenderAll();
      }
    }

    editorRef.current?.updateActiveProperty({
      status: targetStatus,
      ownerName: bookingData.brandName || '',
      picName: bookingData.fullName || '',
      email: bookingData.email || '',
      phone: bookingData.phone || '',
      brandCategory: bookingData.brandCategory || '',
      registrationSource: bookingData.source || 'admin',
      registeredBy: bookingData.adminName || 'Admin'
    });
    editorRef.current?.saveState?.();
    setPropertyTick((t) => t + 1);

    // Sync order & invoice to database for current floorplan
    api.checkoutOrder({
      floorplanId: currentFloorplanId,
      boothId: targetId,
      boothCode: targetCode,
      fullName: bookingData.fullName,
      brandName: bookingData.brandName,
      brandCategory: bookingData.brandCategory,
      email: bookingData.email,
      phone: bookingData.phone,
      totalAmount: bookingData.grandTotal || bookingData.price,
      applyTax: bookingData.applyTax,
      taxRate: bookingData.taxRate,
      paidAmount: bookingData.paidAmount,
      remainingAmount: bookingData.remainingAmount,
      paymentType: bookingData.paymentType || 'full',
      downPaymentPercent: bookingData.dpPercent || (bookingData.paymentType === 'dp' ? 50 : 0),
      bookingType: bookingData.bookingType || 'payment_gateway',
      paymentMethod: bookingData.paymentMethod || (isReservedOnly ? (bookingData.bookingType === 'booking' ? 'Booking Hold (Belum Bayar)' : `Transfer Bank Manual (${bookingData.transferBank || 'Bank'})`) : 'manual_admin'),
      transferBank: bookingData.transferBank || '',
      transferSenderName: bookingData.transferSenderName || '',
      notes: bookingData.notes || '',
      invoiceNumber: bookingData.invoiceNumber,
      source: bookingData.source || 'admin',
      adminName: bookingData.adminName || 'Admin'
    }).then((res) => {
      if (!res?.success) showToast(`⚠️ ${res?.error || 'Pendaftaran tenant gagal disimpan'}`);
      else if (res.warnings?.length) showToast(`ℹ️ ${res.warnings[0]}`);
      // Auto-save the updated canvas state to server so both SQLite booths table AND canvas_fabric_json match
      handleSaveDraft(currentFloorplanStatus === 'published', { silent: true });
    }).catch(err => console.warn("Admin checkout order error:", err));

    showToast(`🎉 Booth ${targetCode} berhasil didaftarkan untuk "${bookingData.brandName}"!`);
    setActiveBookingBooth(null);
    setBookingModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  // Handle selection from Canvas
  const handleSelectionChange = useCallback((single, multiple) => {
    setSelectedObject(single);
    setSelectedObjects(multiple || (single ? [single] : []));
    setPropertyTick((t) => t + 1);
  }, []);

  // Draw / refresh the read-only operational overlay (after every canvas load too: see onStateLoaded)
  useEffect(() => {
    const canvas = editorRef.current?.getCanvas();
    if (!canvas) return;
    const seq = ++opsOverlaySeqRef.current;
    canvas.getObjects().filter(o => o.isOpsOverlay).forEach(o => canvas.remove(o));
    canvas.requestRenderAll();
    if (!showOpsLayer || !currentFloorplanId) return;
    (async () => {
      const res = await api.fetchOpsLayer(currentFloorplanId, { elementsOnly: '1' });
      if (seq !== opsOverlaySeqRef.current || !res?.success) return;
      const raws = (res.elements || []).map(e => e.object).filter(Boolean);
      if (!raws.length) return;
      const objs = await fabric.util.enlivenObjects(raws);
      if (seq !== opsOverlaySeqRef.current) return;
      objs.forEach((obj, idx) => {
        hydrateBoothObject(obj, raws[idx], []);
        obj.set({ selectable: false, evented: false, hasControls: false, hasBorders: false, excludeFromExport: true, objectCaching: false });
        obj.isOpsOverlay = true;
        obj.isOpsItem = false;
        canvas.add(obj);
      });
      resolveAnchors(canvas, objs);
      canvas.requestRenderAll();
    })();
  }, [showOpsLayer, currentFloorplanId, opsOverlayTick]);

  // Anchored operational elements follow a booth while Sales moves it
  useEffect(() => {
    const canvas = editorRef.current?.getCanvas();
    if (!canvas || !showOpsLayer) return;
    const follow = () => {
      const overlays = canvas.getObjects().filter(o => o.isOpsOverlay);
      if (overlays.length) { resolveAnchors(canvas, overlays); canvas.requestRenderAll(); }
    };
    canvas.on('object:modified', follow);
    canvas.on('object:moving', follow);
    return () => { canvas.off('object:modified', follow); canvas.off('object:moving', follow); };
  }, [showOpsLayer, currentFloorplanId]);

  // Auto-merge booth: adjacent Reserved/Sold booths of the same exhibitor are drawn as one booth (positions unchanged)
  useEffect(() => {
    const canvas = editorRef.current?.getCanvas();
    if (!canvas) return;
    applyBoothCorners(canvas, boothCornerPct);
    setMergeGroups(refreshMergeRendering(canvas, { enabled: autoMerge, gridScale }));
  }, [allCanvasObjects, propertyTick, autoMerge, boothCornerPct]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Tampilkan Terpisah" / "Gabungkan Kembali" for one group (display only; booths & invoices stay unchanged)
  const handleToggleMergeDisplay = async (group, separate) => {
    if (!group || !currentFloorplanId) return;
    const res = await api.setMergeDisplay(currentFloorplanId, group.codes, separate);
    if (!res?.success) { showToast(`⚠️ ${res?.error || 'Gagal mengubah tampilan booth gabungan'}`); return; }
    group.members.forEach(m => { m.boothData.mergeSeparate = separate; });
    setPropertyTick(t => t + 1);
    showToast(separate ? `Booth ${group.codes.join(', ')} ditampilkan terpisah` : `🔗 Booth ${group.codes.join('+')} kembali tampil tergabung`);
  };

  const handleUpdateProperty = useCallback((props) => {
    editorRef.current?.updateActiveProperty(props);
    setPropertyTick((t) => t + 1);
  }, []);

  // Load target template from URL or active floorplan from SQLite database on mount
  useEffect(() => {
    const loadInitialFloorplan = async () => {
      isInitialLoadedRef.current = false;

      // 1. Fetch all events & projects
      let evts = [];
      try {
        evts = await api.fetchEvents();
        if (evts && evts.length > 0) {
          setAllEvents(evts);
        }
      } catch (err) {
        console.warn("Failed to fetch events on mount:", err);
      }

      if (targetTemplateId) {
        try {
          const data = await api.fetchFloorplanById(targetTemplateId);
          const fp = data?.floorplan || data;
          if (fp && fp.id) {
            setCurrentFloorplanId(fp.id);
            setCurrentFloorplanTitle(fp.title || 'Denah');
            setCurrentFloorplanVenue(fp.venue || fp.metadata?.event?.venue || fp.metadata?.venue || 'Jakarta Convention Center (Hall A)');
            setShowCaptions(captionsFromMeta(fp.metadata));
            setAutoMerge(autoMergeFromMeta(fp.metadata));
            setBoothCornerPct(cornerFromMeta(fp.metadata));
            setCurrentFloorplanStatus(fp.status || 'draft');
            setCurrentPublicSlug(fp.status === 'published' ? fp.public_slug || null : null);
            if (data?.event) setCurrentEvent(data.event);
            if (data?.halls && data.halls.length > 0) setSiblingHalls(data.halls);
            else if (evts.length > 0) {
              const matched = evts.find(e => e.id === (fp.event_id || data?.event?.id));
              if (matched) {
                setCurrentEvent(matched);
                if (matched.halls) setSiblingHalls(matched.halls);
              }
            }

            if (fp.blueprint) {
              setBlueprintData(fp.blueprint);
            } else {
              setBlueprintData(null);
            }
            let fabricJson = fp.canvas_fabric_json;
            if (typeof fabricJson === 'string') {
              try { fabricJson = JSON.parse(fabricJson); } catch (e) {}
            }
            if (fabricJson && editorRef.current) {
              markLoadedAsSaved(editorRef.current.loadHistoryState(fabricJson, fp.booths || []));
            } else {
              editorRef.current?.clearAll();
            }
            showToast(`📂 Membuka project denah: "${fp.title}"`);
            offerDraftRestore(fp);
            // Mark initial load complete after processing
            isInitialLoadedRef.current = true;
            setSaveStatus('saved');
            return;
          }
        } catch (e) {
          console.warn("Failed to load specified template from param, falling back to active", e);
        }
      }

      const activeFp = await api.fetchActiveFloorplan();
      if (activeFp && (activeFp.id || activeFp.canvas_fabric_json)) {
        if (activeFp.id) setCurrentFloorplanId(activeFp.id);
        if (activeFp.title) setCurrentFloorplanTitle(activeFp.title);
        const venueVal = activeFp.venue || activeFp.metadata?.event?.venue || activeFp.metadata?.venue;
        if (venueVal) setCurrentFloorplanVenue(venueVal);
        setShowCaptions(captionsFromMeta(activeFp.metadata));
        setAutoMerge(autoMergeFromMeta(activeFp.metadata));
        setBoothCornerPct(cornerFromMeta(activeFp.metadata));
        if (activeFp.status) setCurrentFloorplanStatus(activeFp.status);
        setCurrentPublicSlug(activeFp.status === 'published' ? activeFp.public_slug || null : null);
        if (activeFp.event) setCurrentEvent(activeFp.event);
        if (activeFp.halls && activeFp.halls.length > 0) setSiblingHalls(activeFp.halls);
        else if (evts.length > 0) {
          const matched = evts.find(e => e.id === (activeFp.event_id || activeFp.event?.id));
          if (matched) {
            setCurrentEvent(matched);
            if (matched.halls) setSiblingHalls(matched.halls);
          }
        }

        let fabricJson = activeFp.canvas_fabric_json;
        if (typeof fabricJson === 'string') {
          try { fabricJson = JSON.parse(fabricJson); } catch (e) {}
        }
        if (fabricJson && editorRef.current) {
          try {
            markLoadedAsSaved(editorRef.current.loadHistoryState(fabricJson, activeFp.booths || []));
            if (activeFp.blueprint) {
              setBlueprintData(activeFp.blueprint);
            }
          } catch (e) {
            console.error("Failed to restore canvas state from database:", e);
          }
        }
      } else {
        // Fresh brand-new application state
        setCurrentFloorplanId('');
        setCurrentFloorplanTitle('Kanvas Baru');
        setCurrentFloorplanVenue('');
        setShowCaptions(true);
        setAutoMerge(true);
        setBoothCornerPct(0);
        setCurrentFloorplanStatus('draft');
        setBlueprintData(null);
        editorRef.current?.clearAll();
      }
      // Mark initial load complete after processing
      isInitialLoadedRef.current = true;
      setSaveStatus('saved');
    };

    setTimeout(loadInitialFloorplan, 120);
  }, [targetTemplateId]);

  // Load a specific template by ID
  const handleLoadTemplate = async (templateId) => {
    try {
      isInitialLoadedRef.current = false;
      const data = await api.fetchFloorplanById(templateId);
      const fp = data?.floorplan || data;
      if (fp && fp.id) {
        setCurrentFloorplanId(fp.id);
        setCurrentFloorplanTitle(fp.title || 'Denah');
        setCurrentFloorplanVenue(fp.venue || fp.metadata?.event?.venue || fp.metadata?.venue || 'Jakarta Convention Center (Hall A)');
        setShowCaptions(captionsFromMeta(fp.metadata));
        setAutoMerge(autoMergeFromMeta(fp.metadata));
        setBoothCornerPct(cornerFromMeta(fp.metadata));
        setCurrentFloorplanStatus(fp.status || 'draft');
        setCurrentPublicSlug(fp.status === 'published' ? fp.public_slug || null : null);
        if (data?.event) setCurrentEvent(data.event);
        if (data?.halls && data.halls.length > 0) setSiblingHalls(data.halls);

        if (fp.blueprint) {
          setBlueprintData(fp.blueprint);
        } else {
          setBlueprintData(null);
        }
        let fabricJson = fp.canvas_fabric_json;
        if (typeof fabricJson === 'string') {
          try { fabricJson = JSON.parse(fabricJson); } catch (e) {}
        }
        if (fabricJson && editorRef.current) {
          markLoadedAsSaved(editorRef.current.loadHistoryState(fabricJson, fp.booths || []));
        } else {
          editorRef.current?.clearAll();
        }
        showToast(`📂 Denah "${fp.title}" berhasil dimuat ke editor!`);
        offerDraftRestore(fp);
        setTimeout(() => {
          isInitialLoadedRef.current = true;
          setSaveStatus('saved');
        }, 500);
      }
    } catch (e) {
      console.error("Failed to load template:", e);
      showToast("⚠️ Gagal memuat template denah");
      isInitialLoadedRef.current = true;
    }
  };

  const handleSelectEvent = (eventId) => {
    const targetEvt = allEvents.find(e => e.id === eventId);
    if (targetEvt && targetEvt.halls?.length > 0) {
      handleLoadTemplate(targetEvt.halls[0].id);
    }
  };

  const handleCreateHall = async (payload) => {
    try {
      const res = await api.createHall(payload);
      if (res && res.success && res.floorplan) {
        showToast(`🎉 Hall "${res.floorplan.title}" berhasil dibuat!`);
        // Refresh events list
        const evts = await api.fetchEvents();
        setAllEvents(evts || []);
        // Load the new hall into the canvas editor
        await handleLoadTemplate(res.floorplan.id);
        return { success: true };
      }
      return { success: false, error: res?.error || 'Gagal membuat hall baru' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Create a brand new template (Blank or Preset or Cloned)
  const handleCreateNewTemplate = async ({ title, venue, presetType, sourceId, status, copyOpsLayer = false }) => {
    try {
      isInitialLoadedRef.current = false;
      const newId = `FP-${Date.now()}`;
      let templatePayload = null;

      if (presetType === 'duplicate' && sourceId) {
        const sourceData = await api.fetchFloorplanById(sourceId);
        const sourceFp = sourceData?.floorplan || sourceData;
        if (sourceFp && sourceFp.id) {
          let fabricJson = sourceFp.canvas_fabric_json || { version: '6.0.0', objects: [] };
          if (typeof fabricJson === 'string') {
            try { fabricJson = JSON.parse(fabricJson); } catch (e) {}
          }
          let metaJson = sourceFp.metadata_json || sourceFp.metadata;
          if (typeof metaJson === 'string') {
            try { metaJson = JSON.parse(metaJson); } catch (e) {}
          }
          const bpToCopy = sourceFp.blueprint || (sourceFp.blueprint_json ? (typeof sourceFp.blueprint_json === 'string' ? JSON.parse(sourceFp.blueprint_json) : sourceFp.blueprint_json) : null);
          templatePayload = {
            id: newId,
            eventId: 'EVT-2026-001',
            title: title || `${sourceFp.title} (Salinan)`,
            fabricJson: fabricJson,
            metadata: metaJson || {
              schema_version: '1.0',
              event: { id: 'EVT-2026-001', title, venue: venue || 'Jakarta Convention Center (Hall A)', created_at: new Date().toISOString() },
              booths: sourceFp.booths || [],
              venue_elements: sourceFp.venueItems || []
            },
            blueprint: bpToCopy,
            status: status || 'draft',
            booths: sourceFp.booths || [],
            venueElements: sourceFp.venueItems || []
          };
        }
      }

      if (!templatePayload) {
        const presetData = generatePresetFloorplanData(presetType, {
          title,
          venue,
          gridScale
        });

        templatePayload = {
          id: newId,
          eventId: 'EVT-2026-001',
          title: title,
          fabricJson: presetData.fabricJson,
          metadata: presetData.metadata,
          blueprint: null,
          status: status || 'draft',
          booths: presetData.booths || [],
          venueElements: presetData.venueElements || []
        };
      }

      // Save to database
      const res = await api.saveFloorplan(templatePayload);
      if (res.success) {
        if (status === 'published') {
          await api.publishFloorplan(newId);
        }
        if (copyOpsLayer && presetType === 'duplicate' && sourceId) {
          const copied = await api.copyOpsLayer(newId, sourceId);
          if (copied?.success) showToast(`🦺 ${copied.copied} elemen Lapisan Operasional ikut disalin`);
          else showToast(`⚠️ Lapisan operasional gagal disalin: ${copied?.error || 'server error'}`);
        }

        setCurrentFloorplanId(newId);
        setCurrentFloorplanTitle(title);
        setCurrentFloorplanStatus(status || 'draft');
        setBlueprintData(templatePayload.blueprint || null);
        // A copied template keeps its display settings ("Salin dari Template Lain")
        setShowCaptions(captionsFromMeta(templatePayload.metadata));
        setAutoMerge(autoMergeFromMeta(templatePayload.metadata));
        setBoothCornerPct(cornerFromMeta(templatePayload.metadata));

        if (editorRef.current) {
          if (templatePayload.fabricJson?.objects?.length > 0) {
            markLoadedAsSaved(editorRef.current.loadHistoryState(templatePayload.fabricJson));
          } else {
            editorRef.current.clearAll();
          }
        }

        showToast(`✨ Template "${title}" berhasil dibuat dan dibuka di editor!`);
        setTimeout(() => {
          isInitialLoadedRef.current = true;
          setSaveStatus('saved');
        }, 500);
      } else {
        showToast(`⚠️ Gagal membuat template: ${res.error || 'Server error'}`);
        isInitialLoadedRef.current = true;
      }
    } catch (e) {
      console.error("Failed to create new template:", e);
      showToast("⚠️ Gagal membuat template baru");
      isInitialLoadedRef.current = true;
    }
  };

  // Save current canvas as a new named template
  const handleSaveAsNewTemplate = async (title) => {
    const canvas = editorRef.current?.getCanvas();
    if (!canvas) return;

    const newId = `FP-${Date.now()}`;
    const payload = exportToPRDJson(canvas, {
      id: 'EVT-2026-001',
      title: title,
      venue: 'Jakarta Convention Center (Hall A)'
    }, gridScale);
    
    const fabricJson = canvas.toObject(CANVAS_SERIALIZE_PROPS);
    const bpData = editorRef.current?.getBlueprintData() || blueprintData;

    const res = await api.saveFloorplan({
      id: newId,
      eventId: 'EVT-2026-001',
      title: title,
      fabricJson,
      metadata: { ...payload, display: { showCaptions, autoMerge, boothCornerPct } },
      blueprint: bpData,
      status: 'draft',
      booths: payload?.booths || [],
      venueElements: payload?.venue_elements || []
    });

    if (res.success) {
      setCurrentFloorplanId(newId);
      setCurrentFloorplanTitle(title);
      setCurrentFloorplanStatus('draft');
      showToast(`✨ Template "${title}" berhasil disimpan sebagai draft baru!`);
    }
  };

  // Save current canvas directly as a new Preset Layout
  const handleSaveCanvasAsPreset = async () => {
    const canvas = editorRef.current?.getCanvas();
    if (!canvas) return;

    const presetTitle = window.prompt(`Masukkan nama Preset Layout untuk denah "${currentFloorplanTitle}":`, `Preset Layout: ${currentFloorplanTitle}`);
    if (!presetTitle || !presetTitle.trim()) return;

    const payload = exportToPRDJson(canvas, {
      id: 'EVT-2026-001',
      title: presetTitle,
      venue: currentFloorplanVenue || 'Jakarta Convention Center (Hall A)'
    }, gridScale);

    const fabricJson = canvas.toObject(CANVAS_SERIALIZE_PROPS);

    try {
      const res = await api.saveFloorplanAsPreset({
        floorplanId: currentFloorplanId,
        title: presetTitle.trim(),
        description: `Preset layout turunan dari denah "${currentFloorplanTitle}"`,
        tag: 'Preset Admin',
        fabricJson,
        metadata: { ...payload, display: { showCaptions, autoMerge, boothCornerPct } }
      });

      if (res.success) {
        showToast(`✨ Denah "${presetTitle}" berhasil disimpan sebagai Preset Layout baru!`);
      } else {
        showToast(`⚠️ Gagal menyimpan preset layout: ${res.error || 'Server error'}`);
      }
    } catch (e) {
      showToast('⚠️ Terjadi kesalahan saat menyimpan preset layout');
    }
  };

  const handleBatchUpdate = useCallback((props) => {
    editorRef.current?.batchUpdateProperties(props);
    setPropertyTick((t) => t + 1);
  }, []);

  // Save draft / publish to SQLite database & mirror to localStorage
  latestEditorMetaRef.current = { title: currentFloorplanTitle, venue: currentFloorplanVenue, blueprint: blueprintData, showCaptions, autoMerge, boothCornerPct };

  const buildSaveSnapshot = (fabricJson, bpData, title, venue, captions = true, merge = true, corner = 0) =>
    JSON.stringify([fabricJson, bpData || null, title, venue, captions, merge, corner]);

  // Reads the latest title/venue/blueprint via a ref: it also runs from async callbacks created in older renders
  const takeEditorSnapshot = () => {
    const canvas = editorRef.current?.getCanvas();
    if (!canvas) return null;
    const { title, venue, blueprint, showCaptions: captions, autoMerge: merge, boothCornerPct: corner } = latestEditorMetaRef.current;
    return buildSaveSnapshot(canvas.toObject(CANVAS_SERIALIZE_PROPS), editorRef.current?.getBlueprintData() || blueprint, title, venue, captions, merge, corner);
  };

  // Called once a floorplan has finished loading into the editor: that state is what the server has
  // A save that could not reach the server left its canvas in this browser (IndexedDB, utils/localDraft.js): offer it
  // once when that floorplan is opened again. Restoring only loads it into the editor; the next save sends it.
  const offerDraftRestore = (fp) => {
    if (readOnlyStudio || !fp?.id) return;
    setTimeout(async () => {
      const draft = await readDraft(fp.id);
      if (!draft?.payload?.fabricJson?.objects) return;
      const when = new Date(draft.savedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      const restore = window.confirm(`Ada draft denah "${fp.title}" yang belum tersimpan ke server (${when}, tersimpan di browser ini).\n\nPulihkan draft tersebut ke editor? Pilih Batal untuk membuangnya dan memakai data server.`);
      await dropDraft(fp.id);
      if (!restore || !editorRef.current) return;
      await editorRef.current.loadHistoryState(draft.payload.fabricJson, fp.booths || []);
      if (draft.payload.blueprint !== undefined) setBlueprintData(draft.payload.blueprint || null);
      setSaveStatus('unsaved');
      showToast('Draft dipulihkan. Klik Simpan untuk mengirimnya ke server.');
    }, 1500);
  };

  const markLoadedAsSaved = (loadPromise) => {
    lastSavedSnapshotRef.current = null;
    Promise.resolve(loadPromise).then(() => {
      lastSavedSnapshotRef.current = takeEditorSnapshot();
    });
  };

  const handleSaveDraft = async (isPublish = false, options = {}) => {
    // Read-only Studio (Sales): nothing is ever saved from here (registrations are saved by the checkout itself)
    if (readOnlyStudio) return;
    const { silent = false } = options;
    let publishResult = null;
    const publishFlag = isPublish === true;
    setSaveStatus('saving');
    try {
      const canvas = editorRef.current?.getCanvas();
      if (canvas) {
        const payload = exportToPRDJson(canvas, {
          id: 'EVT-2026-001',
          title: currentFloorplanTitle || 'Denah Utama Hall A',
          venue: currentFloorplanVenue || 'Jakarta Convention Center (Hall A)'
        }, gridScale);
        
        const fabricJson = canvas.toObject(CANVAS_SERIALIZE_PROPS);
        const bpData = editorRef.current?.getBlueprintData() || blueprintData;
        const snapshotBeingSaved = buildSaveSnapshot(fabricJson, bpData, currentFloorplanTitle, currentFloorplanVenue, showCaptions, autoMerge, boothCornerPct);

        const saveStatusToUse = publishFlag ? 'published' : (currentFloorplanStatus || 'draft');
        const res = await api.saveFloorplan({
          id: currentFloorplanId || `FP-${Date.now()}`,
          eventId: 'EVT-2026-001',
          title: currentFloorplanTitle || 'Denah Utama Hall A',
          venue: currentFloorplanVenue || 'Jakarta Convention Center (Hall A)',
          fabricJson,
          metadata: {
            ...payload,
            display: { showCaptions, autoMerge, boothCornerPct },
            event: {
              id: 'EVT-2026-001',
              title: currentFloorplanTitle || 'Denah Utama Hall A',
              venue: currentFloorplanVenue || 'Jakarta Convention Center (Hall A)',
              created_at: new Date().toISOString()
            }
          },
          blueprint: bpData,
          status: saveStatusToUse,
          booths: payload?.booths || [],
          venueElements: payload?.venue_elements || []
        });

        if (!res?.success) {
          throw new Error(res?.error || 'Gagal menyimpan ke server');
        }
        lastSavedSnapshotRef.current = snapshotBeingSaved;

        if (res && res.floorplanId) {
          setCurrentFloorplanId(res.floorplanId);
          setSearchParams({ templateId: res.floorplanId }, { replace: true });
        }

        if (publishFlag) {
          publishResult = await api.publishFloorplan(res?.floorplanId || currentFloorplanId);
          if (!publishResult?.success) {
            throw new Error(publishResult?.error || 'Gagal mempublikasikan denah');
          }
          setCurrentFloorplanStatus('published');
          setCurrentPublicSlug(publishResult.slug || null);
        }
      }

      setSaveStatus('saved');
      if (!silent) {
        showToast(isPublish ? `🎉 "${currentFloorplanTitle}" dipublikasikan di /live/${publishResult?.slug || ''}` : `Perubahan "${currentFloorplanTitle}" tersimpan ke Database!`);
      }
      return publishResult || { success: true };
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus('unsaved');
      // Also surface failed auto-saves: otherwise edits silently stay only in this browser
      const message = friendlyError(err, 'Gagal menyimpan ke server');
      showToast(`⚠️ ${silent ? 'Auto-save gagal' : 'Gagal menyimpan denah ke server'}: ${message}`);
      return { success: false, error: message };
    }
  };

  useEffect(() => {
    try { localStorage.setItem(AUTOSAVE_PREF_KEY, String(autoSaveEnabled)); } catch (e) {}
  }, [autoSaveEnabled]);

  // Debounced background auto-save: 2.5s after the last edit, save only if the editor differs from the server copy
  useEffect(() => {
    if (!isInitialLoadedRef.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      const snapshot = takeEditorSnapshot();
      if (snapshot !== null && snapshot === lastSavedSnapshotRef.current) {
        setSaveStatus('saved');
        return;
      }
      if (autoSaveEnabled) {
        handleSaveDraft(false, { silent: true });
      } else {
        setSaveStatus('unsaved');
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [allCanvasObjects, propertyTick, blueprintData, autoSaveEnabled, currentFloorplanTitle, currentFloorplanVenue, showCaptions, autoMerge, boothCornerPct]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live background sync: fetch incoming booth status updates (e.g. online bookings) from SQLite
  useEffect(() => {
    const syncBoothsFromDb = async () => {
      if (!isInitialLoadedRef.current || saveStatus === 'saving') return;
      if (!currentFloorplanId) return;

      const canvas = editorRef.current?.getCanvas();
      if (!canvas) return;

      // Do not sync if user is actively selecting/editing something
      if (canvas.getActiveObject() || canvas.getActiveObjects().length > 0) return;

      try {
        const currentFp = await api.fetchFloorplanById(currentFloorplanId);
        const fpData = currentFp?.floorplan || currentFp;
        if (fpData && fpData.booths && fpData.booths.length > 0) {
          let hasVisualChanges = false;
          canvas.getObjects().forEach(obj => {
            if (obj.isBooth && obj.boothData) {
              const objCode = (obj.boothData.code || obj.boothData.booth_number || '').trim().toLowerCase();
              const objId = String(obj.boothData.id || '');

              const match = fpData.booths.find(b => {
                const bCode = (b.code || b.booth_number || '').trim().toLowerCase();
                const bId = String(b.id || '');

                const matchId = objId && (bId === objId || bId.endsWith(`_${objId}`) || objId.endsWith(`_${bId}`));
                const matchCode = objCode && bCode && (
                  bCode === objCode ||
                  (objCode.includes('+') && objCode.split('+').map(s=>s.trim().toLowerCase()).includes(bCode)) ||
                  (bCode.includes('+') && bCode.split('+').map(s=>s.trim().toLowerCase()).includes(objCode))
                );

                return matchId || matchCode;
              });

              if (match) {
                const matchOwner = match.owner_name !== undefined ? match.owner_name : (match.ownerName !== undefined ? match.ownerName : '');
                // Only update if there is a difference to avoid unnecessary re-renders
                if (obj.boothData.status !== match.status || obj.boothData.ownerName !== matchOwner ||
                  (obj.boothData.exhibitorId || '') !== (match.exhibitor_id || '') || Boolean(obj.boothData.mergeSeparate) !== Boolean(match.merge_separate)) {
                  hydrateBoothObject(obj, null, fpData.booths);
                  updateBoothAppearance(obj, obj.boothData);
                  obj.dirty = true;
                  hasVisualChanges = true;
                }
              }
            }
          });
          if (hasVisualChanges) {
            canvas.requestRenderAll();
            setAllCanvasObjects([...canvas.getObjects()]);
          }
        }
      } catch (err) {
        console.warn("Error live syncing booths in Admin:", err);
      }
    };

    const interval = setInterval(syncBoothsFromDb, 3000);
    return () => clearInterval(interval);
  }, [saveStatus, currentFloorplanId]);

  const handleUpdateFloorplanTitle = (newTitle) => {
    if (!newTitle) return;
    setCurrentFloorplanTitle(newTitle);
    setSaveStatus('unsaved');
    showToast(`✏️ Nama project diubah menjadi "${newTitle}"`);
  };

  const handleUpdateFloorplanVenue = (newVenue) => {
    if (!newVenue) return;
    setCurrentFloorplanVenue(newVenue);
    setSaveStatus('unsaved');
    showToast(`🏢 Lokasi / Venue gedung diubah menjadi "${newVenue}"`);
  };

  const handleNewFloorplan = () => {
    if (window.confirm("Apakah Anda yakin ingin membuat denah baru dari awal?")) {
      isInitialLoadedRef.current = false;
      const newId = `FP-${Date.now()}`;
      const newTitle = `Denah Baru ${new Date().toLocaleDateString('id-ID')}`;
      setCurrentFloorplanId(newId);
      setCurrentFloorplanTitle(newTitle);
      setCurrentFloorplanStatus('draft');
      setBlueprintData(null);
      editorRef.current?.clearAll();
      showToast(`Membuka kanvas baru: "${newTitle}"`);
      setTimeout(() => {
        isInitialLoadedRef.current = true;
        setSaveStatus('saved');
      }, 500);
    }
  };

  // Summary statistics
  const summaryStats = useMemo(() => {
    const booths = allCanvasObjects.filter(o => o.isBooth && o.boothData);
    const available = booths.filter(b => b.boothData.status === 'available').length;
    const reserved = booths.filter(b => b.boothData.status === 'reserved').length;
    const sold = booths.filter(b => b.boothData.status === 'sold').length;
    const maintenance = booths.filter(b => b.boothData.status === 'maintenance').length;
    const potentialRevenue = booths.reduce((acc, b) => acc + (b.boothData.price || 0), 0);

    return {
      totalBooths: booths.length,
      available,
      reserved,
      sold,
      maintenance,
      potentialRevenue,
      gridScale
    };
  }, [allCanvasObjects, gridScale]);

  // Export JSON payload generator
  const exportPayload = useMemo(() => {
    const canvas = editorRef.current?.getCanvas();
    return exportToPRDJson(canvas, {
      id: currentFloorplanId || 'NEW-FLOORPLAN',
      title: currentFloorplanTitle || 'Denah Baru',
      venue: currentFloorplanVenue || 'Venue Belum Ditentukan'
    }, gridScale);
  }, [allCanvasObjects, isExportOpen, gridScale, currentFloorplanTitle, currentFloorplanId, currentFloorplanVenue]);

  // Export Floorplan to Official PDF
  const handleExportPdf = async (options = {}) => {
    try {
      const canvas = editorRef.current?.getCanvas();
      if (!canvas) {
        showToast('⚠️ Kanvas belum siap untuk diekspor ke PDF');
        return;
      }

      const boothObjs = canvas.getObjects().filter(o => o.isBooth && o.boothData);
      const booths = boothObjs.map(o => ({
        ...o.boothData,
        dimensions: `${o.boothData.widthM || 3}x${o.boothData.heightM || 3}m`
      }));

      const dataUrl = editorRef.current?.getPngDataUrl(2.5) || canvas.toDataURL({ format: 'png', multiplier: 2.5 });

      await exportFloorplanToPdf(dataUrl, {
        eventTitle: currentEvent?.title || currentFloorplanTitle,
        hallTitle: currentFloorplanTitle,
        venue: currentFloorplanVenue,
        summary: summaryStats,
        booths
      }, options);

      showToast(`📄 Berhasil menyimpan denah "${currentFloorplanTitle}" ke format PDF!`);
    } catch (err) {
      console.error('Export to PDF error:', err);
      showToast('⚠️ Gagal membuat file PDF');
    }
  };

  return (
    <div className="flex flex-col h-screen w-full min-w-0 max-w-full overflow-hidden bg-slate-900 font-sans relative">
      {/* Top Navbar */}
      <TopNavbar
        onOpenBlueprintModal={() => {
          const liveBp = editorRef.current?.getBlueprintData();
          if (liveBp) {
            setBlueprintData(liveBp);
          }
          setIsBlueprintOpen(true);
        }}
        hasBlueprint={Boolean(blueprintData?.url || editorRef.current?.getBlueprintData()?.url)}
        onOpenTemplatesModal={() => setIsTemplatesOpen(true)}
        onOpenNewTemplateModal={() => setIsNewTemplateOpen(true)}
        onOpenInvoiceModal={() => {
          setActiveInvoiceBooth(null);
          setIsInvoiceOpen(true);
        }}
        onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
        currentFloorplanTitle={currentFloorplanTitle}
        currentFloorplanVenue={currentFloorplanVenue}
        currentFloorplanStatus={currentFloorplanStatus}
        currentFloorplanId={currentFloorplanId}
        currentEvent={currentEvent}
        allEvents={allEvents}
        siblingHalls={siblingHalls}
        onSelectEvent={handleSelectEvent}
        onSelectHall={(hallId) => handleLoadTemplate(hallId)}
        onOpenCreateHall={() => setIsCreateHallOpen(true)}
        onUpdateFloorplanTitle={handleUpdateFloorplanTitle}
        onUpdateFloorplanVenue={handleUpdateFloorplanVenue}
        onOpenExportModal={() => setIsExportOpen(true)}
        onOpenPublishModal={() => setIsPublishOpen(true)}
        onSaveDraft={handleSaveDraft}
        saveStatus={saveStatus}
        autoSaveEnabled={autoSaveEnabled}
        onToggleAutoSave={() => setAutoSaveEnabled(prev => !prev)}
        onNewFloorplan={() => setIsNewTemplateOpen(true)}
        onSaveAsPreset={handleSaveCanvasAsPreset}
        isPreviewMode={isPreviewMode}
        readOnly={readOnlyStudio}
        onTogglePreviewMode={() => setIsPreviewMode(!isPreviewMode)}
        opsLayerVisible={showOpsLayer}
        onToggleOpsLayer={() => {
          setShowOpsLayer(v => !v);
          showToast(!showOpsLayer ? '🦺 Lapisan Operasional ditampilkan (hanya-baca)' : 'Lapisan Operasional disembunyikan');
        }}
        onOpenOpsMode={['superadmin', 'operations'].includes(user?.role) ? () => navigate(`/admin/ops${currentFloorplanId ? `?templateId=${encodeURIComponent(currentFloorplanId)}` : ''}`) : undefined}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative w-full min-w-0">
        {/* Left Toolbar & Shape Catalog */}
        {!isPreviewMode && (
          <ToolSidebar
            onSyncTemplatePrices={canSyncTemplatePrices(user) && !readOnlyStudio ? openPriceSync : undefined}
            onAddBooth={(params) => {
              editorRef.current?.addBooth(params);
              showToast(`🎪 Booth ${params.category || 'Standar'} (${params.widthM || 3}x${params.heightM || 3}m) berhasil ditambahkan ke denah!`);
            }}
            onAddVenueItem={(type) => {
              editorRef.current?.addVenueItem(type);
              showToast(`🏢 Fasilitas venue berhasil ditambahkan ke denah!`);
            }}
            onAddLibraryElement={(type) => editorRef.current?.addLibraryElement(type)}
            onToggleLayerVisibility={(obj) => editorRef.current?.toggleObjectVisibility(obj)}
            onToggleLayerLock={(obj) => editorRef.current?.toggleObjectLock(obj)}
            onAddDoor={(doorType, widthM) => {
              editorRef.current?.addDoor({ doorType, widthM });
            }}
            onAddBasicShape={(shapeId) => {
              editorRef.current?.addBasicShape(shapeId);
              showToast(`🔷 Bentuk grafis berhasil ditambahkan ke denah!`);
            }}
            objectsList={allCanvasObjects}
            onSelectObject={(obj) => editorRef.current?.selectObject(obj)}
            onDeleteObject={(obj) => {
              const canvas = editorRef.current?.getCanvas();
              if (canvas) {
                canvas.remove(obj);
                canvas.requestRenderAll();
                setSelectedObject(null);
                setSelectedObjects([]);
              }
            }}
            activeObjectId={selectedObject?.boothData?.id || selectedObject?.venueData?.id}
            selectedObject={selectedObject}
            onUpdateProperty={handleUpdateProperty}
            onOpenInvoiceModal={() => {
              setActiveInvoiceBooth(null);
              setIsInvoiceOpen(true);
            }}
            onOpenInvoiceEditorModal={() => setIsInvoiceEditorOpen(true)}
            onOpenCategoryModal={() => {
              window.location.href = `/admin/settings?tab=categories${currentFloorplanId ? `&projectId=${currentFloorplanId}` : ''}`;
            }}
            propertyTick={propertyTick + categoriesVersion}
            gridScale={gridScale}
            currentFloorplanId={currentFloorplanId}
          />
        )}

        {/* Center Canvas */}
        <main className="flex-1 min-w-0 relative h-full overflow-hidden flex flex-col">
          <CanvasEditor
            onWarning={showToast}
            ref={editorRef}
            onSelectionChange={handleSelectionChange}
            onObjectsUpdate={setAllCanvasObjects}
            snapToGrid={snapToGrid}
            showGrid={showGrid}
            showRuler={showRuler}
            showDimensions={showDimensions}
            showCaptions={showCaptions}
            gridScale={gridScale}
            isPanMode={isPanMode}
            zoomLevel={zoomLevel}
            onZoomChange={setZoomLevel}
            blueprintData={blueprintData}
            onBlueprintLoaded={setBlueprintData}
            isPreviewMode={isPreviewMode}
            onHistoryChange={setHistoryState}
            onOpenBookingForBooth={(boothData) => {
              if (tenantLocked) { showToast(TENANT_LOCKED_MSG); return; }
              // Read-only Studio (Sales): only an empty booth can be registered; a booked one is never re-assigned here
              if (readOnlyStudio && (String(boothData?.ownerName || '').trim() || ['reserved', 'sold'].includes(String(boothData?.status || '').toLowerCase()))) {
                showToast(`Booth ${boothData?.code || ''} sudah terisi${boothData?.ownerName ? ` oleh ${boothData.ownerName}` : ''}. Invoice-nya ada di menu Exhibitor.`);
                return;
              }
              setActiveBookingBooth(boothData);
            }}
            readOnlyNotice={readOnlyStudio}
            // "Cari tenant / booth": every role of the Studio except Keuangan (AGENTS.md §36)
            boothSearch={user?.role !== 'finance'}
            onBoothAction={salesActions ? (boothData, anchor) => setActionBooth({ booth: boothData, anchor }) : undefined}
            highlightBoothCode={actionBooth?.booth?.code || null}
            onStateLoaded={(canvas) => {
              // corners are applied inside the load, so the "saved" snapshot already contains them
              applyBoothCorners(canvas, boothCornerRef.current);
              setOpsOverlayTick(t => t + 1);
            }}
            snapToBooths={snapToBooths}
            snapToWalls={snapToWalls}
            snapToElements={snapToElements}
            onOpenInvoiceForBooth={(boothData) => {
              setActiveInvoiceBooth(boothData);
              setIsInvoiceOpen(true);
            }}
          />

          {/* Floating Canvas Controls Docked at the Bottom */}
          {!isPreviewMode && (
            <CanvasBottomBar
              zoomLevel={zoomLevel}
              onZoomIn={() => editorRef.current?.setZoomLevel(Math.min(zoomLevel * 1.2, 5))}
              onZoomOut={() => editorRef.current?.setZoomLevel(Math.max(zoomLevel / 1.2, 0.2))}
              onZoomReset={() => editorRef.current?.resetZoom()}
              onZoomFit={() => editorRef.current?.fitToScreen()}
              isPanMode={isPanMode}
              onTogglePanMode={() => setIsPanMode(!isPanMode)}
              snapToGrid={snapToGrid}
              onToggleSnapToGrid={() => {
                setSnapToGrid(!snapToGrid);
                showToast(!snapToGrid ? `🧲 Snap-to-Grid Aktif (${gridScale}px)` : 'Bebas Grid Dinonaktifkan');
              }}
              showGrid={showGrid}
              onToggleShowGrid={() => setShowGrid(!showGrid)}
              showRuler={showRuler}
              onToggleShowRuler={() => setShowRuler(!showRuler)}
              showDimensions={showDimensions}
              onToggleShowDimensions={() => setShowDimensions(!showDimensions)}
              boothCornerPct={boothCornerPct}
              onChangeBoothCornerPct={setBoothCornerPct}
              snapToBooths={snapToBooths}
              onToggleSnapToBooths={() => {
                setSnapToBooths(!snapToBooths);
                showToast(!snapToBooths ? '🧲 Snap ke Booth aktif (tahan Alt / Option untuk menonaktifkan sementara)' : 'Snap ke Booth dinonaktifkan');
              }}
              snapToWalls={snapToWalls}
              onToggleSnapToWalls={() => setSnapToWalls(!snapToWalls)}
              snapToElements={snapToElements}
              onToggleSnapToElements={() => {
                setSnapToElements(!snapToElements);
                showToast(!snapToElements ? '📐 Snap ke Elemen aktif (tahan Alt / Option untuk menonaktifkan sementara)' : 'Snap ke Elemen dinonaktifkan');
              }}
              autoMerge={autoMerge}
              onToggleAutoMerge={() => {
                setAutoMerge(!autoMerge);
                showToast(!autoMerge ? '🔗 Auto-merge booth aktif untuk project ini' : 'Auto-merge booth dinonaktifkan untuk project ini (semua booth tampil terpisah)');
              }}
              showCaptions={showCaptions}
              onToggleShowCaptions={() => {
                setShowCaptions(!showCaptions);
                showToast(!showCaptions ? '💬 Semua caption elemen ditampilkan' : '💬 Semua caption elemen disembunyikan (juga di Live Floorplan setelah disimpan)');
              }}
              gridScale={gridScale}
              canUndo={historyState.canUndo}
              canRedo={historyState.canRedo}
              onUndo={() => editorRef.current?.undo()}
              onRedo={() => editorRef.current?.redo()}
              isMultiSelection={selectedObjects.length > 1}
              isGroupSelection={(selectedObject?.type || '').toLowerCase() === 'group' && (!selectedObject?.isBooth || selectedObject?.isCustomGroup)}
              onGroupSelected={() => editorRef.current?.groupSelected()}
              onUngroupSelected={() => editorRef.current?.ungroupSelected()}
              onMergeBooths={() => {
                const res = editorRef.current?.mergeSelectedBooths();
                if (res && !res.success) {
                  showToast(`⚠️ ${res.error}`);
                } else if (res && res.success) {
                  showToast(`✨ Berhasil menggabungkan booth #${res.mergedCode} (${res.dimensions})!`);
                }
              }}
              onAddShape={(shapeId) => {
                editorRef.current?.addBasicShape(shapeId);
                showToast(`🔷 Bentuk grafis berhasil ditambahkan!`);
              }}
              onExportPdf={handleExportPdf}
            />
          )}
        </main>

        {/* Right Property Inspector Panel */}
        {!isPreviewMode && (
          <PropertyPanel
            key={selectedObject ? (selectedObject.boothData?.id || selectedObject.venueData?.id || 'active') : 'none'}
            selectedObject={selectedObject}
            selectedObjects={selectedObjects}
            canvasObjects={allCanvasObjects}
            showCaptions={showCaptions}
            mergeGroup={selectedObject?.isBooth ? mergeGroups.find(g => g.members.includes(selectedObject)) || null : null}
            autoMergeEnabled={autoMerge}
            onToggleMergeDisplay={handleToggleMergeDisplay}
            boothCornerPct={boothCornerPct}
            currentFloorplanId={currentFloorplanId}
            propertyTick={propertyTick}
            tenantLocked={tenantLocked}
            onUpdateProperty={handleUpdateProperty}
            onBatchUpdate={handleBatchUpdate}
            onApplyShapeStyle={(style) => editorRef.current?.applyShapeStyle(style)}
            onDeleteSelected={() => {
              const canvas = editorRef.current?.getCanvas();
              if (canvas) {
                const active = canvas.getActiveObjects();
                active.forEach(obj => canvas.remove(obj));
                canvas.discardActiveObject();
                canvas.requestRenderAll();
                setSelectedObject(null);
                setSelectedObjects([]);
              }
            }}
            onDuplicateSelected={() => editorRef.current?.duplicateSelected()}
            onGroupSelected={() => editorRef.current?.groupSelected()}
            onUngroupSelected={() => editorRef.current?.ungroupSelected()}
            onMergeBooths={() => {
              const res = editorRef.current?.mergeSelectedBooths();
              if (res && !res.success) {
                showToast(`⚠️ ${res.error}`);
              } else if (res && res.success) {
                showToast(`✨ Berhasil menggabungkan booth #${res.mergedCode} (${res.dimensions})!`);
              }
            }}
            onBringForward={() => editorRef.current?.bringForward()}
            onSendBackward={() => editorRef.current?.sendBackward()}
            onOpenInvoiceForBooth={(boothData) => {
              setActiveInvoiceBooth(boothData);
              setIsInvoiceOpen(true);
            }}
            onOpenBookingForBooth={(boothData, options) => {
              handleOpenBooking(boothData, options);
            }}
            onDetachTenant={handleDetachTenant}
            onOpenCategoryModal={() => {
              window.location.href = `/admin/settings?tab=categories${currentFloorplanId ? `&projectId=${currentFloorplanId}` : ''}`;
            }}
            canvasSummary={summaryStats}
          />
        )}
      </div>

      {/* Notification Toast */}
      {toastMessage && (
        <div className="absolute bottom-6 right-6 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-xl border border-slate-700 shadow-2xl flex items-center gap-2 text-xs animate-fadeIn">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sales: booth pop up (Buat Invoice / Booking Manual / Beri Diskon) */}
      {salesActions && actionBooth && (
        <SalesBoothActions
          floorplanId={currentFloorplanId}
          booth={actionBooth.booth}
          anchor={actionBooth.anchor}
          onClose={closeBoothActions}
          onChanged={applyServerBooth}
          showToast={showToast}
        />
      )}

      {/* Booking Tenant Modal */}
      {(bookingModalConfig.isOpen || activeBookingBooth) && (
        <BookingModal
          booth={bookingModalConfig.booth || activeBookingBooth}
          projectId={currentFloorplanId}
          isAdmin={true}
          mode={bookingModalConfig.mode || 'register'}
          initialData={bookingModalConfig.initialData}
          onClose={() => {
            setActiveBookingBooth(null);
            setBookingModalConfig(prev => ({ ...prev, isOpen: false }));
          }}
          onSuccessBooking={handleAdminBookingSuccess}
          onUpdateBiodata={handleTenantBiodataUpdated}
        />
      )}

      {/* Modals */}
      {canSyncTemplatePrices(user) && !readOnlyStudio && (
        <TemplatePriceSyncModal
          isOpen={isPriceSyncOpen}
          floorplanId={currentFloorplanId}
          floorplanTitle={currentFloorplanTitle}
          onClose={() => setIsPriceSyncOpen(false)}
          showToast={showToast}
          onPricesChanged={(changes) => {
            editorRef.current?.applyServerPrices(changes);
            setPropertyTick(t => t + 1);
          }}
        />
      )}

      <CategoryTierModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onCategoriesUpdated={handleCategoriesUpdated}
        showToast={showToast}
      />

      <InvoiceModal
        isOpen={isInvoiceOpen}
        onClose={() => {
          setIsInvoiceOpen(false);
          setActiveInvoiceBooth(null);
        }}
        initialBooth={activeInvoiceBooth}
        allCanvasObjects={allCanvasObjects}
        currentFloorplanId={currentFloorplanId}
        currentFloorplanTitle={currentFloorplanTitle}
        showToast={showToast}
        onOpenEditor={() => setIsInvoiceEditorOpen(true)}
      />

      <InvoiceEditorModal
        isOpen={isInvoiceEditorOpen}
        onClose={() => setIsInvoiceEditorOpen(false)}
        showToast={showToast}
      />

      <TemplateManagerModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        currentFloorplanId={currentFloorplanId}
        currentFloorplanTitle={currentFloorplanTitle}
        onLoadTemplate={handleLoadTemplate}
        onSaveAsNewTemplate={handleSaveAsNewTemplate}
        onOpenNewTemplateModal={() => setIsNewTemplateOpen(true)}
        onFloorplanPublished={(publishedId) => {
          handleLoadTemplate(publishedId);
        }}
        showToast={showToast}
      />

      <NewTemplateModal
        isOpen={isNewTemplateOpen}
        onClose={() => setIsNewTemplateOpen(false)}
        onCreateTemplate={handleCreateNewTemplate}
        showToast={showToast}
      />

      <BlueprintModal
        isOpen={isBlueprintOpen}
        onClose={() => setIsBlueprintOpen(false)}
        onApplyBlueprint={(bp) => {
          setBlueprintData(bp);
          setSaveStatus('unsaved');
          if (bp) {
            showToast(bp.isLocked ? '🔒 Blueprint berhasil dikunci di latar belakang denah' : '🔓 Blueprint dibuka kuncinya untuk diatur posisinya');
          } else {
            showToast('🗑️ Blueprint latar belakang dihapus');
          }
        }}
        currentBlueprint={editorRef.current?.getBlueprintData() || blueprintData}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        jsonData={exportPayload}
        onExportSvg={() => editorRef.current?.exportSvg()}
        onExportPng={() => editorRef.current?.exportPng()}
        onExportPdf={handleExportPdf}
        currentFloorplanTitle={currentFloorplanTitle}
        currentEventTitle={currentEvent?.title || currentFloorplanTitle}
        currentVenue={currentFloorplanVenue}
      />

      <PublishModal
        isOpen={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
        floorplanStats={summaryStats}
        floorplanTitle={currentFloorplanTitle}
        isPublished={currentFloorplanStatus === 'published'}
        publicSlug={currentPublicSlug}
        onConfirmPublish={() => handleSaveDraft(true)}
        onUnpublish={async () => {
          const res = await api.unpublishFloorplan(currentFloorplanId);
          if (res?.success) {
            setCurrentFloorplanStatus('draft');
            setCurrentPublicSlug(null);
            showToast(`⏸️ ${res.message}`);
          } else {
            showToast(`⚠️ ${res?.error || 'Gagal menghentikan publikasi'}`);
          }
          return res;
        }}
      />

      <CreateHallModal
        isOpen={isCreateHallOpen}
        onClose={() => setIsCreateHallOpen(false)}
        currentEvent={currentEvent}
        existingHalls={siblingHalls}
        onCreateHall={handleCreateHall}
      />
    </div>
  );
}
