import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as fabric from 'fabric';
import BookingModal from '../../components/public/BookingModal';
import CartDrawer from '../../components/public/CartDrawer';
import { 
  ShoppingCart, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  Search, 
  Building2, 
  MapPin, 
  Layers, 
  Sparkles, 
  Info, 
  X,
  CheckCircle2,
  Calendar,
  ChevronRight,
  Tag,
  ArrowRight,
  LayoutGrid,
  FileText
} from 'lucide-react';
import { STATUS_CONFIG, hydrateBoothObject, getProportionalBoothTypography, applyBoothCorners } from '../../utils/floorplanUtils';
import { exportFloorplanToPdf } from '../../utils/floorplanPdfExport';
import { drawElementCaptions, findCaptionHit } from '../../utils/elementCaptions';
import { resolveAnchors } from '../../utils/opsLayer';
import { refreshMergeRendering, groupOfBooth, selectionClusters, groupDetails, formatArea, mergeCodeLabel, MERGE_STATUS_LABELS } from '../../utils/boothMerge';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { canAccessPage } from '../../utils/roles';

// Live Denah shows only the floorplan the admin published, even for a logged-in admin
const PUBLIC_VIEW = { view: 'public' };

// Public link of one published floorplan: /live/<slug> (several floorplans can be live, each on its own link)
const slugFromPath = () => {
  const m = window.location.pathname.match(/^\/live\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};
import { generatePresetFloorplanData } from '../../utils/presetLayouts';

// Helper to calculate auto-fit text ensuring zero text truncation
function fitText(rawText, maxW, baseSize = 10, minSize = 5.5) {
  if (!rawText) return { text: '', fontSize: baseSize };
  const str = String(rawText).trim();
  const charRatio = 0.58;
  
  let fontSize = baseSize;
  let estimatedW = str.length * fontSize * charRatio;
  
  // Dynamically shrink font size down until it fits within maxW
  if (estimatedW > maxW) {
    fontSize = Math.max(minSize, maxW / (str.length * charRatio));
  }
  
  return { text: str, fontSize };
}

export default function LiveFloorplan() {
  const containerRef = useRef(null);
  // Element captions: floorplan switch (metadata.display.showCaptions), last drawn positions, tapped element
  const captionsEnabledRef = useRef(true);
  // Floorplan shown on this page + load sequence (public operational elements are added after the canvas loads)
  const liveFpIdRef = useRef('');
  // Auto-merge booth (AGENTS.md §18): project switch + the group shown in the detail modal
  const autoMergeRef = useRef(true);
  // "Sudut Booth" of the published floorplan (metadata.display.boothCornerPct, default siku)
  const boothCornerRef = useRef(0);
  const [mergeTick, setMergeTick] = useState(0);
  const [groupDetail, setGroupDetail] = useState(null);
  const liveLoadSeqRef = useRef(0);
  const captionHitsRef = useRef([]);
  const captionFocusIdRef = useRef(null);
  const captionTipTimerRef = useRef(null);
  const [captionTip, setCaptionTip] = useState(null);
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  
  const [floorplanData, setFloorplanData] = useState(null);
  const [fabricState, setFabricState] = useState(null);
  // Multi-booth selection state
  const [selectedBooths, setSelectedBooths] = useState([]); // array of boothData objects
  const selectedBoothsRef = useRef([]);
  useEffect(() => {
    selectedBoothsRef.current = selectedBooths;
  }, [selectedBooths]);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const selectedBoothObjsRef = useRef([]); // fabric canvas objects currently highlighted
  const showBookingModalRef = useRef(false);
  useEffect(() => {
    showBookingModalRef.current = showBookingModal;
  }, [showBookingModal]);

  const [hoveredBooth, setHoveredBooth] = useState(null);
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Zoom & Stats
  const [zoomLevel, setZoomLevel] = useState(1);
  const [stats, setStats] = useState({ total: 0, available: 0, reserved: 0, sold: 0, free: 0 });
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [dbBooths, setDbBooths] = useState([]);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);
  const [isDismissedEmptyBanner, setIsDismissedEmptyBanner] = useState(false);
  const [linkNotFound, setLinkNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [activeFpTitle, setActiveFpTitle] = useState('');
  const [activeFpVenue, setActiveFpVenue] = useState('');
  const [activeFpId, setActiveFpId] = useState('');
  const [allEvents, setAllEvents] = useState([]);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [siblingHalls, setSiblingHalls] = useState([]);

  // 1-Click Standard Expo Layout Generator
  const { user: authUser } = useAuth();
  const canEditFloorplan = canAccessPage(authUser?.role, 'floorplan');

  const handleLoadStandardPreset = async () => {
    setIsApplyingPreset(true);
    setIsDismissedEmptyBanner(true);
    try {
      const presetData = generatePresetFloorplanData('standard_12_booths', {
        title: 'Indonesia Expo & Exhibition 2026',
        venue: 'Jakarta Convention Center (Hall A)'
      });

      const newFpId = `FP-${Date.now()}`;

      const savePayload = {
        id: newFpId,
        title: 'Indonesia Expo & Exhibition 2026',
        venue: 'Jakarta Convention Center (Hall A)',
        fabricJson: presetData.fabricJson,
        canvas_fabric_json: presetData.fabricJson,
        booths: presetData.booths,
        venueElements: presetData.venueElements,
        venue_elements: presetData.venueElements,
        metadata: presetData.metadata,
        status: 'published'
      };

      // 1. Immediately apply to local state & canvas for instantaneous display
      setActiveFpId(newFpId);
      setActiveFpTitle('Indonesia Expo & Exhibition 2026');
      setActiveFpVenue('Jakarta Convention Center (Hall A)');
      setFabricState(presetData.fabricJson);
      setFloorplanData({
        ...presetData.metadata,
        title: 'Indonesia Expo & Exhibition 2026',
        venue: 'Jakarta Convention Center (Hall A)',
        event: {
          title: 'Indonesia Expo & Exhibition 2026',
          venue: 'Jakarta Convention Center (Hall A)'
        }
      });
      setDbBooths(presetData.booths);
      
      if (fabricRef.current) {
        await loadObjectsIntoCanvas(presetData.fabricJson, presetData.booths);
      }

      // 2. Persist to SQLite backend
      const result = await api.saveFloorplan(savePayload);
      if (result && (result.success || result.floorplanId || result.id)) {
        showToast('🎉 Denah pameran standar (12 Booth) berhasil dimuat!');
        const savedId = result.floorplanId || result.id || newFpId;
        // Clean URL parameters so it stays on the newly published floorplan
        const url = new URL(window.location.href);
        url.searchParams.delete('templateId');
        url.searchParams.delete('project');
        url.searchParams.delete('hallId');
        window.history.pushState({}, '', url.toString());
        await loadFloorplan(savedId);
      } else {
        showToast('Gagal memuat denah standar ke server.');
      }
    } catch (err) {
      console.error('Failed to load standard preset:', err);
      showToast('Terjadi kesalahan saat memuat denah standar.');
    } finally {
      setIsApplyingPreset(false);
    }
  };

  // Dynamically compute displayStats from canvas objects or dbBooths to guarantee 100% synchronization
  const displayStats = useMemo(() => {
    // 1. Primary authority: if canvas is loaded and has booth objects, count actual objects
    if (fabricRef.current) {
      const cBooths = fabricRef.current.getObjects().filter(o => o.isBooth && o.boothData);
      if (cBooths.length > 0) {
        let total = 0, available = 0, reserved = 0, sold = 0, free = 0;
        cBooths.forEach(o => {
          total++;
          const st = String(o.boothData.status || 'available').trim().toLowerCase();
          if (st === 'available') available++;
          else if (st === 'reserved') reserved++;
          else if (st === 'sold') sold++;
          else if (st === 'free') free++;
        });
        return { total, available, reserved, sold, free };
      }
    }
    // 2. Secondary authority: dbBooths from active floorplan
    if (Array.isArray(dbBooths) && dbBooths.length > 0) {
      let total = 0, available = 0, reserved = 0, sold = 0, free = 0;
      dbBooths.forEach(b => {
        total++;
        const st = String(b.status || 'available').trim().toLowerCase();
        if (st === 'available') available++;
        else if (st === 'reserved') reserved++;
        else if (st === 'sold') sold++;
        else if (st === 'free') free++;
      });
      return { total, available, reserved, sold, free };
    }
    return stats;
  }, [stats, dbBooths, fabricState]);

  // True empty state: only when there are zero booths and zero canvas objects and loading has finished
  const isEmptyFloorplan = useMemo(() => {
    if (isLoading) return false;
    if (isDismissedEmptyBanner) return false;
    if (activeFpId) return false;
    if (activeFpTitle) return false;
    if (displayStats.total > 0 || stats.total > 0) return false;
    if (Array.isArray(dbBooths) && dbBooths.length > 0) return false;
    if (fabricState?.objects && fabricState.objects.length > 0) return false;
    if (fabricRef.current) {
      const activeObjs = fabricRef.current.getObjects().filter(o => !o.isGridLine && !o.isBackgroundBlueprint);
      if (activeObjs.length > 0) return false;
    }
    return true;
  }, [isLoading, isDismissedEmptyBanner, activeFpId, activeFpTitle, displayStats.total, stats.total, dbBooths, fabricState]);

  const [systemConfig, setSystemConfig] = useState({ isPublicBookingActive: true, isPaymentActive: true });
  const systemConfigRef = useRef(systemConfig);
  useEffect(() => {
    systemConfigRef.current = systemConfig;
  }, [systemConfig]);
  const lastStateStrRef = useRef('');

  // Dynamic categories strictly derived from booths currently existing on the active floorplan
  const availableCategories = useMemo(() => {
    const catMap = new Map();

    // 1. Primary source: dbBooths belonging to this active floorplan
    if (Array.isArray(dbBooths) && dbBooths.length > 0) {
      dbBooths.forEach(b => {
        const cat = (b.category || b.brand_category || '').trim();
        if (cat) {
          catMap.set(cat, (catMap.get(cat) || 0) + 1);
        }
      });
    } else if (fabricState?.objects) {
      // Fallback from raw fabric objects
      fabricState.objects.forEach(obj => {
        if (obj.isBooth && obj.boothData?.category) {
          const cat = String(obj.boothData.category).trim();
          if (cat) {
            catMap.set(cat, (catMap.get(cat) || 0) + 1);
          }
        }
      });
    }

    // Convert to array of { name, count }
    return Array.from(catMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [dbBooths, fabricState]);

  // Auto-reset categoryFilter if selected category no longer exists on this floorplan
  useEffect(() => {
    if (categoryFilter !== 'ALL' && !availableCategories.some(c => c.name.toLowerCase() === categoryFilter.toLowerCase())) {
      setCategoryFilter('ALL');
    }
  }, [availableCategories, categoryFilter]);

  // 1. Fetch saved / published data from SQLite server & local storage
  const loadFloorplan = useCallback(async (forcedTemplateId = null, options = {}) => {
    const isForce = Boolean(options?.force);
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const templateId = forcedTemplateId || searchParams.get('templateId') || searchParams.get('project') || searchParams.get('hallId');
      
      // Also fetch all events for project switcher
      try {
        const evts = await api.fetchEvents(PUBLIC_VIEW);
        if (evts && evts.length > 0) {
          setAllEvents(evts);
        }
      } catch (e) {}

      let activeFp = null;
      let parentEvt = null;
      let halls = [];

      // /live/<slug>: exactly that published floorplan; an unknown or unpublished link never falls back to another one
      const slug = !forcedTemplateId ? slugFromPath() : null;
      if (slug) {
        const data = await api.fetchActiveFloorplan({ ...PUBLIC_VIEW, slug });
        if (!data || !data.id) {
          setLinkNotFound(true);
          setIsLoading(false);
          return;
        }
        setLinkNotFound(false);
        activeFp = data;
        if (data?.event) parentEvt = data.event;
        // A shared link shows only its own floorplan: no switcher to the other live floorplans
        halls = [];
        setAllEvents([]);
        setSiblingHalls([]);
      }

      if (!activeFp && templateId) {
        const data = await api.fetchFloorplanById(templateId, PUBLIC_VIEW);
        activeFp = data?.floorplan || data;
        if (data?.event) parentEvt = data.event;
        if (data?.halls) halls = data.halls;
      }
      if (!activeFp) {
        const data = await api.fetchActiveFloorplan(PUBLIC_VIEW);
        activeFp = data;
        if (data?.event) parentEvt = data.event;
        if (data?.halls) halls = data.halls;
      }

      if (parentEvt) setCurrentEvent(parentEvt);
      if (halls && halls.length > 0) setSiblingHalls(halls);
      else if (activeFp?.event_id && !slug) {
        try {
          const evts = await api.fetchEvents(PUBLIC_VIEW);
          const matched = evts.find(e => e.id === activeFp.event_id);
          if (matched) {
            setCurrentEvent(matched);
            if (matched.halls) setSiblingHalls(matched.halls);
          }
        } catch (e) {}
      }

      try {
        const cfg = await api.fetchInvoiceConfig();
        if (cfg) {
          setSystemConfig({
            isPublicBookingActive: cfg.isPublicBookingActive !== false,
            isPaymentActive: cfg.isPaymentActive !== false
          });
        }
      } catch (e) {
        console.warn("Failed to load invoice config in LiveFloorplan:", e);
      }

      if (activeFp && (activeFp.id || activeFp.canvas_fabric_json || activeFp.title)) {
        const resolvedId = activeFp.id || activeFp.metadata?.id || activeFp.event_id || 'FP-ACTIVE';
        liveFpIdRef.current = activeFp.id || '';
        setActiveFpId(prevId => {
          if (prevId && prevId !== resolvedId) {
            setSelectedBooths([]);
            selectedBoothObjsRef.current = [];
            setHoveredBooth(null);
            setCategoryFilter('ALL');
            setStatusFilter('ALL');
            setSearchQuery('');
          }
          return resolvedId;
        });
        if (activeFp.title) setActiveFpTitle(activeFp.title);
        const resolvedVenue = activeFp.venue || activeFp.metadata?.event?.venue || activeFp.metadata?.venue || 'Jakarta Convention Center (Hall A)';
        if (resolvedVenue) setActiveFpVenue(resolvedVenue);
        captionsEnabledRef.current = activeFp.metadata?.display?.showCaptions !== false;
        autoMergeRef.current = activeFp.metadata?.display?.autoMerge !== false;
        boothCornerRef.current = Number(activeFp.metadata?.display?.boothCornerPct) || 0;

        let fabricJson = activeFp.canvas_fabric_json;
        if (typeof fabricJson === 'string') {
          try { fabricJson = JSON.parse(fabricJson); } catch (e) {}
        }

        const currentStateStr = JSON.stringify({
          id: resolvedId,
          title: activeFp.title,
          venue: resolvedVenue,
          fabric: fabricJson,
          booths: activeFp.booths || []
        });

        if (!isForce && (showBookingModalRef.current || selectedBoothObjsRef.current.length > 0)) {
          return;
        }

        if (isForce || currentStateStr !== lastStateStrRef.current) {
          lastStateStrRef.current = currentStateStr;
          setFabricState(fabricJson);
          setFloorplanData({
            ...activeFp.metadata,
            title: activeFp.title,
            venue: resolvedVenue,
            event: {
              title: activeFp.title || 'Expo Event',
              venue: resolvedVenue
            }
          });
          setDbBooths(activeFp.booths || []);
        }
      } else {
        const hasCanvasObjects = fabricRef.current && fabricRef.current.getObjects().filter(o => !o.isGridLine && !o.isBackgroundBlueprint).length > 0;
        if (!hasCanvasObjects) {
          setActiveFpId('');
          setActiveFpTitle('');
          setActiveFpVenue('');
          setFabricState(null);
          setFloorplanData(null);
          setDbBooths([]);
          setSelectedBooths([]);
          selectedBoothObjsRef.current = [];
          if (fabricRef.current) {
            fabricRef.current.clear();
            fabricRef.current.renderAll();
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load floorplan in LiveFloorplan:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSwitchHall = (hallId) => {
    // Published halls have their own link; keep the address bar on it so it can be shared
    const hall = siblingHalls.find(h => h.id === hallId) || allEvents.flatMap(e => e.halls || []).find(h => h.id === hallId);
    if (hall?.slug) {
      window.history.pushState({}, '', `/live/${hall.slug}`);
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set('templateId', hallId);
      window.history.pushState({}, '', url.toString());
    }
    loadFloorplan(hallId);
  };

  const handleSwitchEvent = (eventId) => {
    const targetEvt = allEvents.find(e => e.id === eventId);
    if (targetEvt && targetEvt.halls?.length > 0) {
      handleSwitchHall(targetEvt.halls[0].id);
    }
  };

  const handleExportPdf = async () => {
    try {
      const canvas = fabricRef.current;
      if (!canvas) {
        showToast('⚠️ Denah kanvas belum siap');
        return;
      }
      showToast('📄 Sedang memproses dokumen PDF denah...');
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 3 });
      await exportFloorplanToPdf(dataUrl, {
        eventTitle: currentEvent?.title || eventTitle,
        hallTitle: activeFpTitle || floorplanData?.title || 'Denah Pameran',
        venue: eventVenue,
        summary: displayStats,
        booths: dbBooths
      }, {
        orientation: 'landscape',
        includeDirectory: false
      });
      showToast('🎉 Berhasil mengunduh dokumen PDF denah!');
    } catch (err) {
      console.error('Export live floorplan PDF error:', err);
      showToast('⚠️ Gagal mengunduh file PDF');
    }
  };

  useEffect(() => {
    loadFloorplan();
    const interval = setInterval(loadFloorplan, 3000);
    const handleFocus = () => loadFloorplan();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadFloorplan]);

  // Fit to screen helper
  const fitToScreen = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const objects = canvas.getObjects().filter(o => !o.isGridLine && !o.isBackgroundBlueprint);
    if (objects.length === 0) {
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      setZoomLevel(1);
      canvas.requestRenderAll();
      return;
    }

    // Reset viewport transform first so getBoundingRect gives true un-transformed scene coordinates
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objects.forEach(o => {
      const bound = o.getBoundingRect();
      minX = Math.min(minX, bound.left);
      minY = Math.min(minY, bound.top);
      maxX = Math.max(maxX, bound.left + bound.width);
      maxY = Math.max(maxY, bound.top + bound.height);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 80;
    const zoomX = (canvas.width - padding) / (width || 1);
    const zoomY = (canvas.height - padding) / (height || 1);
    const fitZoom = Math.min(Math.min(zoomX, zoomY), 1.15);

    const panX = (canvas.width - width * fitZoom) / 2 - minX * fitZoom;
    const panY = (canvas.height - height * fitZoom) / 2 - minY * fitZoom;

    canvas.setViewportTransform([fitZoom, 0, 0, fitZoom, panX, panY]);
    setZoomLevel(fitZoom);
    canvas.requestRenderAll();
  }, []);

  // Universal booth resolver from Fabric event target or scene coordinates
  const resolveBoothFromTarget = useCallback((target, scenePoint) => {
    // 1. Direct target checks
    if (target?.isBooth && target?.boothData) return target;
    if (target?.parentBooth?.isBooth && target?.parentBooth?.boothData) return target.parentBooth;
    if (target?.group?.isBooth && target?.group?.boothData) return target.group;

    // 2. Geometric hit-testing with scenePoint
    const canvas = fabricRef.current;
    if (canvas && scenePoint) {
      const allObjects = canvas.getObjects();
      // Search top-to-bottom
      for (let i = allObjects.length - 1; i >= 0; i--) {
        const o = allObjects[i];
        if (o.isBooth && o.boothData && o.visible !== false) {
          try {
            if (typeof o.containsPoint === 'function' && o.containsPoint(scenePoint)) {
              return o;
            }
            const coords = o.getCoords ? o.getCoords() : null;
            if (coords && fabric.Intersection?.isPointInPolygon) {
              if (fabric.Intersection.isPointInPolygon(scenePoint, coords)) {
                return o;
              }
            }
            const bound = typeof o.getBoundingRect === 'function' ? o.getBoundingRect() : null;
            if (bound && 
                scenePoint.x >= bound.left && scenePoint.x <= bound.left + bound.width &&
                scenePoint.y >= bound.top && scenePoint.y <= bound.top + bound.height) {
              return o;
            }
          } catch (e) {}
        }
      }
    }
    return null;
  }, []);

  // 2. Load canvas objects and hydrate booths safely
  const loadObjectsIntoCanvas = useCallback(async (stateToLoad, boothsData) => {
    const loadSeq = ++liveLoadSeqRef.current;
    const canvas = fabricRef.current;
    if (!canvas || !stateToLoad) return;

    let parsedState = stateToLoad;
    if (typeof parsedState === 'string') {
      try { parsedState = JSON.parse(parsedState); } catch (e) {}
    }
    const rawObjects = parsedState?.objects || [];

    // Clear previous objects to prevent ghost elements
    canvas.clear();
    canvas.backgroundColor = '#F8FAFC';

    // Deselect any previous selection
    setSelectedBooths([]);
    selectedBoothObjsRef.current = [];
    setHoveredBooth(null);

    await canvas.loadFromJSON(parsedState);

    let totalBooths = 0;
    let availCount = 0;
    let resCount = 0;
    let soldCount = 0;
    let freeCount = 0;

    canvas.getObjects().forEach((obj, idx) => {
      const raw = rawObjects[idx] || {};
      hydrateBoothObject(obj, raw, boothsData || []);

        // Elements the admin marked internal (CCTV, gudang, panel listrik...) or hid in Layers are not public
        if (obj.venueData?.lib && obj.venueData.publicVisible === false) obj.visible = false;
        if (obj.type?.toLowerCase() === 'i-text') obj.set({ editable: false });

        const isBoothObj = Boolean(obj.isBooth && obj.boothData);

        if (isBoothObj) {
          totalBooths++;
          const bData = obj.boothData || {};

          const status = String(bData.status || 'available').trim().toLowerCase();
          bData.status = status;
          const code = bData.code || bData.booth_number || 'BOOTH';
          const category = bData.category || 'Standard';
          const owner = bData.ownerName || bData.owner || '';
          const w = obj.width || 60;
          const h = obj.height || 60;

          if (status === 'available') availCount++;
          else if (status === 'reserved') resCount++;
          else if (status === 'sold') soldCount++;
          else if (status === 'free') freeCount++;

          // --- DISTINCT MODERN LIVE PRESENTATION STYLING ---
          obj.set({
            selectable: false,
            evented: true,
            subTargetCheck: false,
            interactive: false,
            hasControls: false,
            hasBorders: false,
            controls: {},
            borderColor: 'transparent',
            cornerColor: 'transparent',
            cornerStrokeColor: 'transparent',
            borderOpacityWhenMoving: 0,
            borderScaleFactor: 0,
            padding: 0,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true,
            lockScalingX: true,
            lockScalingY: true,
            strokeUniform: true,
            noScaleCache: true,
            objectCaching: false,
            activeOn: 'none',
            hoverCursor: (status === 'available' || status === 'free') ? 'pointer' : 'default'
          });
          obj.drawBorders = function() {};
          obj.drawControls = function() {};
          obj._renderControls = function() {};
          obj._origLeft = obj.left;
          obj._origTop = obj.top;
          obj._origAngle = obj.angle || 0;

          // Restyle inner objects for a clean, attractive card appearance
          const innerObjects = typeof obj.getObjects === 'function' ? obj.getObjects() : (obj._objects || obj.objects || []);
          if (innerObjects && innerObjects.length > 0) {
            innerObjects.forEach(child => {
              child.set({
                selectable: false,
                evented: false,
                hasControls: false,
                hasBorders: false,
                controls: {},
                borderColor: 'transparent',
                cornerColor: 'transparent',
                activeOn: 'none'
              });
              child.drawBorders = function() {};
              child.drawControls = function() {};
              child._renderControls = function() {};
              child.isBooth = true;
              child.boothData = bData;
              child.parentBooth = obj;
            });
            const padX = Math.max(4, Math.round(w * 0.07));
            const padY = Math.max(4, Math.round(h * 0.07));
            const widthM = bData.widthM || Math.round(w / 20) || 3;
            const heightM = bData.heightM || Math.round(h / 20) || 3;
            const dimStr = `${widthM}x${heightM}m`;
            const codeStr = code || 'A-01';
            const ownerStr = owner ? owner : (status === 'available' ? 'Tersedia' : (status === 'free' ? 'Free Booth' : '-'));
            const statusStr = status.toUpperCase();

            // 1. Background Rect
            const rect = innerObjects.find(o => o.type?.toLowerCase() === 'rect' && o.height > 6);
            if (rect) {
              let rx = 6;
              let ry = 6;
              let strokeDashArray = null;
              let strokeWidth = 2;
              const shapeType = bData.shape || 'rectangle';

              if (shapeType === 'rounded') {
                rx = Math.min(22, Math.max(10, Math.floor(Math.min(w, h) * 0.28)));
                ry = rx;
              } else if (shapeType === 'island_open') {
                rx = 8;
                ry = 8;
                strokeDashArray = [6, 4];
                strokeWidth = 2.5;
              } else if (shapeType === 'hexagon') {
                rx = 12;
                ry = 12;
              } else if (shapeType === 'l_shape') {
                rx = 3;
                ry = 3;
              }

              rect.set({
                width: w,
                height: h,
                rx,
                ry,
                strokeDashArray,
                strokeWidth,
                left: 0,
                top: 0,
                originX: 'center',
                originY: 'center',
                strokeUniform: true
              });

              if (status === 'available') {
                rect.set({
                  fill: '#ffffff',
                  stroke: '#10b981',
                  strokeWidth: 2,
                  shadow: new fabric.Shadow({
                    color: 'rgba(16, 185, 129, 0.15)',
                    blur: 6,
                    offsetX: 0,
                    offsetY: 2
                  })
                });
              } else if (status === 'free') {
                rect.set({
                  fill: '#eff6ff',
                  stroke: '#3b82f6',
                  strokeWidth: 2,
                  shadow: new fabric.Shadow({
                    color: 'rgba(59, 130, 246, 0.2)',
                    blur: 6,
                    offsetX: 0,
                    offsetY: 2
                  })
                });
              } else if (status === 'reserved') {
                rect.set({
                  fill: '#fffbeb',
                  stroke: '#f59e0b',
                  strokeWidth: 2,
                  shadow: new fabric.Shadow({
                    color: 'rgba(245, 158, 11, 0.12)',
                    blur: 6,
                    offsetX: 0,
                    offsetY: 2
                  })
                });
              } else if (status === 'sold') {
                rect.set({
                  fill: '#f1f5f9',
                  stroke: '#94a3b8',
                  strokeWidth: 1.5,
                  shadow: new fabric.Shadow({
                    color: 'rgba(148, 163, 184, 0.15)',
                    blur: 4,
                    offsetX: 0,
                    offsetY: 1
                  })
                });
              }
            }

            // 2. Category top bar accent (if present)
            const accentBar = innerObjects.find(o => o.type?.toLowerCase() === 'rect' && o.height <= 6);
            if (accentBar) {
              accentBar.set({
                width: Math.max(10, w - 8),
                height: 3,
                top: -(h / 2) + 3,
                originX: 'center',
                originY: 'center',
                rx: 1.5,
                ry: 1.5,
                fill: status === 'available' ? '#10b981' : (status === 'free' ? '#3b82f6' : (status === 'reserved' ? '#f59e0b' : '#94a3b8'))
              });
            }

            // 3. Four Distinct Text Elements Strictly Positioned & Bounded
            let textObjs = innerObjects.filter(o => {
              const t = (o.type || '').toLowerCase();
              return t === 'text' || t === 'fabrictext' || t === 'i-text';
            });
            
            // Ensure at least 4 text objects
            while (textObjs.length < 4) {
              const newT = new fabric.FabricText ? new fabric.FabricText('') : new fabric.Text('');
              newT.set({
                originX: 'center',
                originY: 'center',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              });
              obj.add(newT);
              textObjs.push(newT);
            }

            // Proportional Typography Calculation (Scales with booth dimensions, guarantees 0 truncation)
            const typo = getProportionalBoothTypography(w, h, {
              code: codeStr,
              widthM,
              heightM,
              ownerName: ownerStr,
              status: statusStr
            });

            // [A] ATAS SEBELAH KIRI: Ukuran Booth (3x3m, 6x6m, dst)
            const tDim = textObjs[0];
            tDim.set({
              text: typo.dimStr,
              fontSize: typo.dimFontSize,
              fontWeight: '600',
              fill: '#64748b',
              left: -(w / 2) + typo.padX,
              top: -(h / 2) + typo.padY + Math.max(2, Math.round(h * 0.04)),
              originX: 'left',
              originY: 'top',
              visible: true
            });

            // [B] ATAS SEBELAH KANAN: Nomer Booth (A-01, VIP-01, dst)
            const tCode = textObjs[1];
            tCode.set({
              text: typo.codeStr,
              fontSize: typo.codeFontSize,
              fontWeight: '800',
              fill: status === 'free' ? '#1e40af' : (status === 'available' ? '#0f172a' : status === 'reserved' ? '#92400e' : '#334155'),
              left: (w / 2) - typo.padX,
              top: -(h / 2) + typo.padY + Math.max(2, Math.round(h * 0.04)),
              originX: 'right',
              originY: 'top',
              visible: true
            });

            // [C] TENGAH: Nama Peserta / Tenant (PT Telkom / Tersedia / Free)
            const tOwner = textObjs[2];
            tOwner.set({
              text: typo.finalOwnerText,
              fontSize: typo.ownerFontSize,
              fontWeight: owner ? '700' : '500',
              fontStyle: owner ? 'normal' : 'italic',
              textAlign: 'center',
              lineHeight: 1.05,
              fill: status === 'sold' ? '#0f172a' : (status === 'reserved' ? '#b45309' : (status === 'free' ? '#1d4ed8' : '#059669')),
              left: 0,
              top: typo.isMultiLine ? 0 : 1,
              originX: 'center',
              originY: 'center',
              visible: true
            });

            // [D] PALING BAWAH: Status Booth (AVAILABLE / FREE / RESERVED / SOLD)
            const tStatus = textObjs[3];
            tStatus.set({
              text: typo.statusStr,
              fontSize: typo.statusFontSize,
              fontWeight: '800',
              fill: status === 'available' ? '#059669' : (status === 'free' ? '#2563eb' : (status === 'reserved' ? '#d97706' : '#64748b')),
              left: 0,
              top: (h / 2) - typo.padY,
              originX: 'center',
              originY: 'bottom',
              visible: true
            });

            // Hide any surplus text objects beyond 4
            for (let i = 4; i < textObjs.length; i++) {
              textObjs[i].set({ text: '', visible: false });
            }

            obj.dirty = true;
            obj.setCoords();
          } else {
            obj.setCoords();
          }

          // Direct hover events on booth group
          obj.on('mouseover', () => {
            const currentStatus = String(obj.boothData?.status || 'available').trim().toLowerCase();
            setHoveredBooth(obj.boothData || bData);
            if (currentStatus === 'available' || currentStatus === 'free') {
              obj.set({
                shadow: new fabric.Shadow({
                  color: currentStatus === 'free' ? 'rgba(59, 130, 246, 0.45)' : 'rgba(16, 185, 129, 0.4)',
                  blur: 16,
                  offsetX: 0,
                  offsetY: 2
                })
              });
              canvas.requestRenderAll();
            }
          });
          obj.on('mouseout', () => {
            const currentStatus = String(obj.boothData?.status || 'available').trim().toLowerCase();
            setHoveredBooth(null);
            if (currentStatus === 'available') {
              obj.set({
                shadow: new fabric.Shadow({
                  color: 'rgba(16, 185, 129, 0.15)',
                  blur: 6,
                  offsetX: 0,
                  offsetY: 2
                })
              });
            } else if (currentStatus === 'free') {
              obj.set({
                shadow: new fabric.Shadow({
                  color: 'rgba(59, 130, 246, 0.2)',
                  blur: 6,
                  offsetX: 0,
                  offsetY: 2
                })
              });
            } else {
              obj.set({ shadow: undefined });
            }
            canvas.requestRenderAll();
          });
        } else {
          // --- VENUE FACILITIES & INFRASTRUCTURE (MODERN ARCHITECTURAL PRESENTATION) ---
          const objW = obj.width || 100;
          const objH = obj.height || 60;
          const maxW = Math.max(objW - 12, 20);

          obj.set({
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false,
            controls: {},
            borderColor: 'transparent',
            cornerColor: 'transparent',
            cornerStrokeColor: 'transparent',
            borderOpacityWhenMoving: 0,
            borderScaleFactor: 0,
            padding: 0,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true,
            lockScalingX: true,
            lockScalingY: true,
            strokeUniform: true,
            noScaleCache: true,
            objectCaching: false,
            activeOn: 'none',
            hoverCursor: 'default'
          });
          obj.drawBorders = function() {};
          obj.drawControls = function() {};
          obj._renderControls = function() {};
          obj._origLeft = obj.left;
          obj._origTop = obj.top;
          obj._origAngle = obj.angle || 0;

          const venueChildren = typeof obj.getObjects === 'function' ? obj.getObjects() : (obj._objects || obj.objects || []);

          if (venueChildren && venueChildren.length > 0) {
            venueChildren.forEach(child => {
              child.set({
                selectable: false,
                hasControls: false,
                hasBorders: false,
                controls: {},
                borderColor: 'transparent',
                cornerColor: 'transparent',
                activeOn: 'none'
              });
              child.drawBorders = function() {};
              child.drawControls = function() {};
              child._renderControls = function() {};
            });
          }

          const vType = (obj.venueData?.type || obj.id || '').toLowerCase();

          // Door symbols and library elements keep their own drawing (their first rect is an invisible hit area)
          if (venueChildren && venueChildren.length > 0 && vType !== 'door' && !obj.venueData?.lib) {
            const rect = venueChildren.find(o => (o.type || '').toLowerCase() === 'rect');
            const textObj = venueChildren.find(o => {
              const t = (o.type || '').toLowerCase();
              return t === 'text' || t === 'fabrictext' || t === 'i-text';
            });

            if (rect) {
              rect.set({
                rx: 8,
                ry: 8,
                strokeUniform: true
              });

              if (vType.includes('stage')) {
                // Sleek Navy Keynote Stage
                rect.set({
                  fill: '#0f172a',
                  stroke: '#3b82f6',
                  strokeWidth: 2,
                  shadow: new fabric.Shadow({ color: 'rgba(59, 130, 246, 0.2)', blur: 12, offsetX: 0, offsetY: 3 })
                });
                if (textObj) {
                  const stageText = textObj.text || '🎤 MAIN STAGE & AUDITORIUM';
                  const stageFontSize = Math.min(18, Math.max(11, Math.round(objH * 0.26)));
                  const fitted = fitText(stageText, maxW, stageFontSize, 8);
                  textObj.set({ text: fitted.text, fontSize: fitted.fontSize, fill: '#ffffff', fontWeight: 'bold' });
                }
              } else if (vType.includes('entrance')) {
                // Mint Registration Entrance
                rect.set({
                  fill: '#ecfdf5',
                  stroke: '#059669',
                  strokeWidth: 2,
                  shadow: new fabric.Shadow({ color: 'rgba(5, 150, 105, 0.12)', blur: 8, offsetX: 0, offsetY: 2 })
                });
                if (textObj) {
                  const entText = textObj.text || '🚪 MAIN ENTRANCE / REGISTRATION';
                  const entFontSize = Math.min(14, Math.max(9, Math.round(objH * 0.26)));
                  const fitted = fitText(entText, maxW, entFontSize, 7);
                  textObj.set({ text: fitted.text, fontSize: fitted.fontSize, fill: '#065f46', fontWeight: 'bold' });
                }
              } else if (vType.includes('exit')) {
                // Safety Red Emergency Exit
                rect.set({
                  fill: '#fef2f2',
                  stroke: '#dc2626',
                  strokeWidth: 2,
                  shadow: new fabric.Shadow({ color: 'rgba(220, 38, 38, 0.12)', blur: 8, offsetX: 0, offsetY: 2 })
                });
                if (textObj) {
                  const exitText = textObj.text || '🚨 EMERGENCY EXIT K3';
                  const exitFontSize = Math.min(13, Math.max(9, Math.round(objH * 0.26)));
                  const fitted = fitText(exitText, maxW, exitFontSize, 7);
                  textObj.set({ text: fitted.text, fontSize: fitted.fontSize, fill: '#991b1b', fontWeight: 'bold' });
                }
              } else if (vType.includes('toilet')) {
                // Sky Blue Restroom & VIP Lounge
                rect.set({
                  fill: '#f0f9ff',
                  stroke: '#0284c7',
                  strokeWidth: 2,
                  shadow: new fabric.Shadow({ color: 'rgba(2, 132, 199, 0.12)', blur: 8, offsetX: 0, offsetY: 2 })
                });
                if (textObj) {
                  const toiletText = textObj.text || '🚻 RESTROOM & VIP LOUNGE';
                  const toiletFontSize = Math.min(13, Math.max(9, Math.round(objH * 0.26)));
                  const fitted = fitText(toiletText, maxW, toiletFontSize, 7);
                  textObj.set({ text: fitted.text, fontSize: fitted.fontSize, fill: '#0369a1', fontWeight: 'bold' });
                }
              } else if (vType.includes('cafe')) {
                // Bistro Food Court & Cafe
                rect.set({
                  fill: '#fffbeb',
                  stroke: '#d97706',
                  strokeWidth: 2,
                  shadow: new fabric.Shadow({ color: 'rgba(217, 119, 6, 0.12)', blur: 8, offsetX: 0, offsetY: 2 })
                });
                if (textObj) {
                  const cafeText = textObj.text || '☕ FOOD COURT & CAFE';
                  const cafeFontSize = Math.min(13, Math.max(9, Math.round(objH * 0.26)));
                  const fitted = fitText(cafeText, maxW, cafeFontSize, 7);
                  textObj.set({ text: fitted.text, fontSize: fitted.fontSize, fill: '#b45309', fontWeight: 'bold' });
                }
              } else if (vType.includes('pillar')) {
                // Column pillar
                rect.set({
                  fill: '#e2e8f0',
                  stroke: '#64748b',
                  strokeWidth: 1.5,
                  rx: 4,
                  ry: 4
                });
                if (textObj) {
                  const pillarText = textObj.text || '■ PILLAR';
                  const pillarFontSize = Math.min(10, Math.max(7, Math.round(objH * 0.22)));
                  const fitted = fitText(pillarText, maxW, pillarFontSize, 5.5);
                  textObj.set({ text: fitted.text, fontSize: fitted.fontSize, fill: '#475569', fontWeight: 'bold' });
                }
              }
            }
          }

          if (obj.isBackgroundBlueprint) {
            canvas.sendObjectToBack(obj);
          }
        }
      });

      setStats({
        total: totalBooths,
        available: availCount,
        reserved: resCount,
        sold: soldCount,
        free: freeCount
      });

      canvas.requestRenderAll();

      // Same corner setting as the Studio (the restyle above uses the Live colours only)
      applyBoothCorners(canvas, boothCornerRef.current);
      // Adjacent booths of the same exhibitor are drawn as one booth (positions unchanged)
      refreshMergeRendering(canvas, { enabled: autoMergeRef.current });
      setMergeTick(t => t + 1);

      setTimeout(() => {
        fitToScreen();
      }, 150);

      // Denah Operasional: only the operational elements an admin chose to publish are shown to visitors
      const opsFpId = liveFpIdRef.current;
      if (opsFpId) {
        const raws = (await api.fetchPublicOpsElements(opsFpId)).map(e => e.object).filter(Boolean);
        if (raws.length && loadSeq === liveLoadSeqRef.current && fabricRef.current === canvas) {
          const opsObjs = await fabric.util.enlivenObjects(raws);
          if (loadSeq !== liveLoadSeqRef.current) return;
          opsObjs.forEach((obj, i) => {
            hydrateBoothObject(obj, raws[i], []);
            obj.set({ selectable: false, evented: false, hasControls: false, hasBorders: false });
            if (obj.type?.toLowerCase() === 'i-text') obj.set({ editable: false });
            obj.isOpsItem = false;
            obj.isPublicOpsItem = true;
            canvas.add(obj);
          });
          resolveAnchors(canvas, opsObjs);
          canvas.requestRenderAll();
        }
      }
  }, [fitToScreen]);

  // 3. Initialize Interactive Canvas once on mount
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 1000;
    const height = containerRef.current.clientHeight || 700;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      selection: false,
      preserveObjectStacking: true,
      defaultCursor: 'grab',
      backgroundColor: '#F8FAFC', // Clean, bright luxury floor theme
      selectionBorderColor: 'transparent',
      selectionColor: 'transparent',
      selectionLineWidth: 0,
      selectionDashArray: null,
      skipControlsDrawing: true
    });

    // Zero Bounding Box & No Transform on Live Floorplan Canvas
    canvas.skipControlsDrawing = true;
    canvas.drawControls = function() {};
    canvas.discardActiveObject();

    fabricRef.current = canvas;

    // Load initial state if already present
    if (fabricState) {
      loadObjectsIntoCanvas(fabricState, dbBooths);
    }

    // Canvas Panning, Click & Hover State
    let isDragging = false;
    let hasPanned = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let hoveredBoothObj = null;
    let pointerDownTarget = null;

    // Element captions (public elements only: hidden / internal ones are invisible and skipped)
    canvas.on('after:render', ({ ctx }) => {
      const hits = drawElementCaptions(canvas, ctx || canvas.getContext(), { enabled: captionsEnabledRef.current, highlightId: captionFocusIdRef.current });
      if (hits && (!ctx || ctx === canvas.contextContainer)) captionHitsRef.current = hits;
    });
    const captionAt = (e) => {
      if (!captionsEnabledRef.current || !e) return null;
      const vp = canvas.getViewportPoint(e);
      const hit = findCaptionHit(captionHitsRef.current, vp.x, vp.y);
      return hit ? { hit, x: vp.x, y: vp.y } : null;
    };
    const closeCaptionTip = () => {
      clearTimeout(captionTipTimerRef.current);
      if (captionFocusIdRef.current) {
        captionFocusIdRef.current = null;
        canvas.requestRenderAll();
      }
      setCaptionTip(prev => (prev ? null : prev));
    };

    const clearHoverShadow = () => {
      if (hoveredBoothObj && hoveredBoothObj.boothData) {
        const isSelected = selectedBoothObjsRef.current.includes(hoveredBoothObj) ||
          selectedBoothsRef.current.some(b => (b.id || b.code) === (hoveredBoothObj.boothData?.id || hoveredBoothObj.boothData?.code));
        if (!isSelected) {
          const st = String(hoveredBoothObj.boothData.status || 'available').trim().toLowerCase();
          if (st === 'available') {
            hoveredBoothObj.set({
              shadow: new fabric.Shadow({
                color: 'rgba(16, 185, 129, 0.15)',
                blur: 6,
                offsetX: 0,
                offsetY: 2
              })
            });
          } else if (st === 'free') {
            hoveredBoothObj.set({
              shadow: new fabric.Shadow({
                color: 'rgba(59, 130, 246, 0.2)',
                blur: 6,
                offsetX: 0,
                offsetY: 2
              })
            });
          } else {
            hoveredBoothObj.set({ shadow: undefined });
          }
        }
        hoveredBoothObj = null;
      }
    };

    // Canvas-level Hover Detection for Instant Response
    canvas.on('mouse:over', function(opt) {
      const scenePt = opt.scenePoint || (opt.e ? canvas.getScenePoint(opt.e) : null);
      const boothObj = resolveBoothFromTarget(opt.target, scenePt);

      if (boothObj && boothObj.boothData) {
        const bData = boothObj.boothData;
        const bStatus = String(bData.status || 'available').trim().toLowerCase();
        setHoveredBooth(bData);
        canvas.defaultCursor = (bStatus === 'available' || bStatus === 'free') ? 'pointer' : 'default';

        if (hoveredBoothObj !== boothObj) {
          clearHoverShadow();
          hoveredBoothObj = boothObj;
          const isSelected = selectedBoothObjsRef.current.includes(boothObj) ||
            selectedBoothsRef.current.some(b => (b.id || b.code) === (bData.id || bData.code));
          if (!isSelected && (bStatus === 'available' || bStatus === 'free')) {
            boothObj.set({
              shadow: new fabric.Shadow({
                color: bStatus === 'free' ? 'rgba(59, 130, 246, 0.45)' : 'rgba(16, 185, 129, 0.4)',
                blur: 16,
                offsetX: 0,
                offsetY: 2
              })
            });
            canvas.requestRenderAll();
          }
        }
      }
    });

    canvas.on('mouse:out', function(opt) {
      const scenePt = opt.scenePoint || (opt.e ? canvas.getScenePoint(opt.e) : null);
      const boothObj = resolveBoothFromTarget(opt.target, scenePt);

      if (boothObj && boothObj.boothData) {
        clearHoverShadow();
        setHoveredBooth(null);
        canvas.defaultCursor = 'grab';
        canvas.requestRenderAll();
      }
    });

    // Strip any active selection or control points globally for the Live Preview canvas
    canvas.on('selection:created', (e) => {
      canvas.discardActiveObject();
      canvas._activeObject = undefined;
      if (e?.selected) {
        e.selected.forEach(o => {
          o.selectable = false;
          o.hasBorders = false;
          o.hasControls = false;
          o.drawBorders = function() {};
          o.drawControls = function() {};
          o._renderControls = function() {};
        });
      }
      canvas.requestRenderAll();
    });
    canvas.on('selection:updated', (e) => {
      canvas.discardActiveObject();
      canvas._activeObject = undefined;
      if (e?.selected) {
        e.selected.forEach(o => {
          o.selectable = false;
          o.hasBorders = false;
          o.hasControls = false;
          o.drawBorders = function() {};
          o.drawControls = function() {};
          o._renderControls = function() {};
        });
      }
      canvas.requestRenderAll();
    });
    canvas.on('before:selection:cleared', () => {
      canvas.discardActiveObject();
      canvas._activeObject = undefined;
    });

    canvas.on('before:transform', (opt) => {
      if (canvas._currentTransform) {
        canvas._currentTransform = null;
      }
      if (opt?.transform) {
        opt.transform.action = '';
      }
    });

    canvas.on('mouse:down:before', () => {
      canvas.discardActiveObject();
      if (canvas._currentTransform) {
        canvas._currentTransform = null;
      }
    });

    // Strict immutability locks - participants cannot drag, move, scale, or rotate any booth or element
    canvas.on('object:moving', function(e) {
      if (e.target) {
        e.target.set({
          left: e.target._origLeft !== undefined ? e.target._origLeft : e.target.left,
          top: e.target._origTop !== undefined ? e.target._origTop : e.target.top
        });
        e.target.setCoords();
      }
      if (canvas._currentTransform) {
        canvas._currentTransform = null;
      }
      canvas.requestRenderAll();
    });

    canvas.on('object:scaling', function(e) {
      if (e.target) {
        e.target.set({ scaleX: 1, scaleY: 1 });
      }
      if (canvas._currentTransform) {
        canvas._currentTransform = null;
      }
      canvas.requestRenderAll();
    });

    canvas.on('object:rotating', function(e) {
      if (e.target) {
        e.target.set({ angle: e.target._origAngle || 0 });
      }
      if (canvas._currentTransform) {
        canvas._currentTransform = null;
      }
      canvas.requestRenderAll();
    });

    canvas.on('mouse:down', function(opt) {
      canvas.discardActiveObject();
      if (canvas._currentTransform) {
        canvas._currentTransform = null;
      }
      const evt = opt.e;
      startX = evt.clientX;
      startY = evt.clientY;
      lastX = evt.clientX;
      lastY = evt.clientY;
      hasPanned = false;
      pointerDownTarget = opt.target;
      isDragging = true;
    });

    canvas.on('mouse:move', function(opt) {
      if (canvas._currentTransform) {
        canvas._currentTransform = null;
      }
      if (isDragging) {
        const e = opt.e;
        const moveDist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (moveDist > 6) {
          if (!hasPanned) closeCaptionTip();
          hasPanned = true;
          canvas.defaultCursor = 'grabbing';
          const vpt = canvas.viewportTransform;
          vpt[4] += e.clientX - lastX;
          vpt[5] += e.clientY - lastY;
          canvas.requestRenderAll();
        }
        lastX = e.clientX;
        lastY = e.clientY;
      } else {
        // Continuous rollover / hover check
        const scenePt = opt.scenePoint || (opt.e ? canvas.getScenePoint(opt.e) : null);
        const resolved = resolveBoothFromTarget(opt.target, scenePt);
        if (resolved && resolved.boothData) {
          const bData = resolved.boothData;
          const bStatus = String(bData.status || 'available').trim().toLowerCase();
          canvas.defaultCursor = (bStatus === 'available' || bStatus === 'free') ? 'pointer' : 'default';

          if (hoveredBoothObj !== resolved) {
            clearHoverShadow();
            hoveredBoothObj = resolved;
            setHoveredBooth(bData);
            if (bStatus === 'available' || bStatus === 'free') {
              resolved.set({
                shadow: new fabric.Shadow({
                  color: bStatus === 'free' ? 'rgba(59, 130, 246, 0.45)' : 'rgba(16, 185, 129, 0.4)',
                  blur: 16,
                  offsetX: 0,
                  offsetY: 2
                })
              });
              canvas.requestRenderAll();
            }
          }
        } else {
          if (hoveredBoothObj) {
            clearHoverShadow();
            setHoveredBooth(null);
            canvas.defaultCursor = 'grab';
            canvas.requestRenderAll();
          }
          // Hover over a shortened ("…") or hidden caption shows the full name (a tapped caption stays open)
          if (!captionFocusIdRef.current) {
            const found = captionAt(opt.e);
            const text = found && (found.hit.truncated || !found.hit.drawn) ? found.hit.text : null;
            setCaptionTip(prev => {
              if (!text) return prev ? null : prev;
              if (prev && prev.text === text && Math.abs(prev.x - found.x) < 4 && Math.abs(prev.y - found.y) < 4) return prev;
              return { text, x: found.x, y: found.y };
            });
          }
        }
      }
    });

    canvas.on('mouse:up', function(opt) {
      canvas.discardActiveObject();
      if (canvas._currentTransform) {
        canvas._currentTransform = null;
      }
      const evt = opt.e;
      const dist = Math.hypot(evt.clientX - startX, evt.clientY - startY);
      isDragging = false;
      canvas.defaultCursor = 'grab';
      canvas.setViewportTransform(canvas.viewportTransform);

      // CLICK DETECTED (User did not pan canvas)
      if (!hasPanned && dist < 12) {
        const scenePt = opt.scenePoint || (evt ? canvas.getScenePoint(evt) : null);
        const rawTarget = opt.target || pointerDownTarget;
        const boothObj = resolveBoothFromTarget(rawTarget, scenePt);

        if (boothObj && boothObj.boothData) {
          const bData = boothObj.boothData;
          const status = String(bData.status || 'available').trim().toLowerCase();

          if (status === 'available' || status === 'free') {
            if (systemConfigRef.current?.isPublicBookingActive === false) {
              showToast('⚠️ Fitur Booking Booth Publik saat ini sedang Non-Aktif. Hubungi Panitia/Admin untuk pemesanan.');
            } else {
              const bId = bData.id || bData.code;
              const isAlreadySelected = selectedBoothsRef.current.some(b => (b.id || b.code) === bId);

              if (isAlreadySelected) {
                // TOGGLE OFF: Deselect this booth
                const remainingBooths = selectedBoothsRef.current.filter(b => (b.id || b.code) !== bId);
                setSelectedBooths(remainingBooths);
                selectedBoothsRef.current = remainingBooths;

                selectedBoothObjsRef.current = selectedBoothObjsRef.current.filter(
                  o => o !== boothObj && (o.boothData?.id || o.boothData?.code) !== bId
                );

                // Restore default shadow
                boothObj.set({
                  shadow: new fabric.Shadow({
                    color: status === 'free' ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.15)',
                    blur: 6,
                    offsetX: 0,
                    offsetY: 2
                  })
                });
                canvas.requestRenderAll();
                showToast(`Booth ${bData.code || bData.booth_number} dilepas dari pilihan (${remainingBooths.length} terpilih)`);
              } else {
                // TOGGLE ON: Add to multi-booth selection
                const updatedBooths = [...selectedBoothsRef.current, bData];
                setSelectedBooths(updatedBooths);
                selectedBoothsRef.current = updatedBooths;

                if (!selectedBoothObjsRef.current.includes(boothObj)) {
                  selectedBoothObjsRef.current = [...selectedBoothObjsRef.current, boothObj];
                }

                // Highlight selected booth on canvas with luxury active glow
                boothObj.set({
                  shadow: new fabric.Shadow({
                    color: 'rgba(99, 102, 241, 0.9)',
                    blur: 24,
                    offsetX: 0,
                    offsetY: 0
                  })
                });
                canvas.requestRenderAll();
                showToast(`✓ Booth ${bData.code || bData.booth_number} ditambahkan (${updatedBooths.length} booth terpilih)`);
              }
            }
          } else if (groupOfBooth(canvas, boothObj)) {
            // Merged booth: brand, booth numbers, size per booth, total area and status
            setGroupDetail(groupOfBooth(canvas, boothObj));
          } else if (status === 'reserved') {
            showToast(`🔒 Booth ${bData.code || bData.booth_number} sedang dalam proses pembayaran/booking.`);
          } else if (status === 'sold') {
            showToast(`❌ Booth ${bData.code || bData.booth_number} telah terisi oleh ${bData.ownerName || 'Exhibitor'}.`);
          }
        } else {
          // Tap on an element icon or its caption: show the full caption for a few seconds
          const found = captionAt(evt);
          if (found) {
            clearTimeout(captionTipTimerRef.current);
            captionFocusIdRef.current = found.hit.obj.venueData?.id || null;
            setCaptionTip({ text: found.hit.text, x: found.x, y: found.y, tapped: true });
            canvas.requestRenderAll();
            captionTipTimerRef.current = setTimeout(closeCaptionTip, 4000);
          } else {
            closeCaptionTip();
          }
        }
      }
      hasPanned = false;
      pointerDownTarget = null;
    });

    // Zoom on wheel
    canvas.on('mouse:wheel', function(opt) {
      closeCaptionTip();
      const delta = opt.e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      if (zoom > 4) zoom = 4;
      if (zoom < 0.25) zoom = 0.25;
      canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
      opt.e.preventDefault();
      opt.e.stopPropagation();
      setZoomLevel(zoom);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && fabricRef.current) {
        fabricRef.current.setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
        fabricRef.current.requestRenderAll();
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  // 4. Reload canvas objects whenever fabricState or dbBooths changes
  useEffect(() => {
    if (fabricState && fabricRef.current) {
      loadObjectsIntoCanvas(fabricState, dbBooths);
    }
  }, [fabricState, dbBooths, loadObjectsIntoCanvas]);

  // Zoom helper controls
  const handleZoom = (factor) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const center = new fabric.Point(canvas.width / 2, canvas.height / 2);
    let newZoom = canvas.getZoom() * factor;
    newZoom = Math.min(Math.max(newZoom, 0.25), 4);
    canvas.zoomToPoint(center, newZoom);
    setZoomLevel(newZoom);
    canvas.requestRenderAll();
  };

  const handleResetZoom = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoomLevel(1);
    canvas.requestRenderAll();
  };

  // Search & Focus Booth
  const handleSearchBooth = (e) => {
    e.preventDefault();
    const canvas = fabricRef.current;
    if (!canvas || !searchQuery.trim()) return;

    const query = searchQuery.trim().toLowerCase();
    const match = canvas.getObjects().find(o => {
      if (!o.isBooth && !o.boothData) return false;
      const code = String(o.boothData?.code || o.boothData?.booth_number || '').toLowerCase();
      const owner = String(o.boothData?.ownerName || '').toLowerCase();
      return code.includes(query) || owner.includes(query);
    });

    if (match && match.boothData) {
      const bound = match.getBoundingRect();
      const targetZoom = 1.8;
      const vpt = canvas.viewportTransform;
      vpt[0] = targetZoom;
      vpt[3] = targetZoom;
      vpt[4] = canvas.width / 2 - (bound.left + bound.width / 2) * targetZoom;
      vpt[5] = canvas.height / 2 - (bound.top + bound.height / 2) * targetZoom;
      canvas.setViewportTransform(vpt);
      setZoomLevel(targetZoom);
      
      match.set({
        shadow: new fabric.Shadow({
          color: 'rgba(37, 99, 235, 0.5)',
          blur: 24,
          offsetX: 0,
          offsetY: 0
        })
      });
      canvas.requestRenderAll();

      if (match.boothData.status === 'available' || match.boothData.status === 'free') {
        const bId = match.boothData.id || match.boothData.code;
        const alreadySel = selectedBooths.some(b => (b.id || b.code) === bId);
        if (!alreadySel) {
          match.set({ shadow: new fabric.Shadow({ color: 'rgba(99, 102, 241, 0.75)', blur: 22, offsetX: 0, offsetY: 0 }) });
          selectedBoothObjsRef.current = [...selectedBoothObjsRef.current, match];
          setSelectedBooths(prev => [...prev, match.boothData]);
        }
        canvas.requestRenderAll();
      } else {
        showToast(`📍 Booth ${match.boothData.code || match.boothData.booth_number} (${match.boothData.status.toUpperCase()})`);
      }
    } else {
      showToast(`🔍 Booth "${searchQuery}" tidak ditemukan.`);
    }
  };

  // Filter visibility on canvas
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.getObjects().forEach(obj => {
      if (!obj.isBooth && !obj.boothData) return;

      const boothCat = (obj.boothData?.category || 'Standard').trim();
      const boothBrandCat = (obj.boothData?.brandCategory || '').trim();
      const boothStat = obj.boothData?.status || 'available';

      const catMatches = categoryFilter === 'ALL' || 
        boothCat.toLowerCase() === categoryFilter.trim().toLowerCase() ||
        (boothBrandCat && boothBrandCat.toLowerCase() === categoryFilter.trim().toLowerCase());
      const statMatches = statusFilter === 'ALL' || boothStat === statusFilter;

      if (catMatches && statMatches) {
        obj.set({ opacity: 1 });
      } else {
        obj.set({ opacity: 0.15 });
      }
    });

    canvas.requestRenderAll();
  }, [categoryFilter, statusFilter]);

  // Multi-Booth Selection Management Helpers
  const handleDeselectBooth = (bData) => {
    const bId = bData.id || bData.code;
    const remaining = selectedBoothsRef.current.filter(b => (b.id || b.code) !== bId);
    setSelectedBooths(remaining);
    selectedBoothsRef.current = remaining;

    const obj = selectedBoothObjsRef.current.find(o => (o.boothData?.id || o.boothData?.code) === bId);
    if (obj) {
      const st = String(obj.boothData?.status || 'available').trim().toLowerCase();
      obj.set({
        shadow: new fabric.Shadow({
          color: st === 'free' ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.15)',
          blur: 6,
          offsetX: 0,
          offsetY: 2
        })
      });
      selectedBoothObjsRef.current = selectedBoothObjsRef.current.filter(o => o !== obj && (o.boothData?.id || o.boothData?.code) !== bId);
      fabricRef.current?.requestRenderAll();
    }
    showToast(`Booth ${bData.code || bData.booth_number} dilepas dari pilihan`);
  };

  const handleClearAllSelections = () => {
    selectedBoothObjsRef.current.forEach(o => {
      const st = String(o.boothData?.status || 'available').trim().toLowerCase();
      o.set({
        shadow: new fabric.Shadow({
          color: st === 'free' ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.15)',
          blur: 6,
          offsetX: 0,
          offsetY: 2
        })
      });
    });
    selectedBoothObjsRef.current = [];
    setSelectedBooths([]);
    selectedBoothsRef.current = [];
    fabricRef.current?.requestRenderAll();
    showToast('Semua pilihan booth dibatalkan');
  };

  const handleAddSelectedToCart = () => {
    if (selectedBooths.length === 0) return;
    setCart(prev => {
      const existingKeys = new Set(prev.map(c => c.id || c.code));
      const toAdd = selectedBooths.filter(b => !existingKeys.has(b.id || b.code));
      return [...prev, ...toAdd];
    });
    showToast(`✓ ${selectedBooths.length} booth berhasil ditambahkan ke keranjang`);
  };

  // BOOKING HANDLER (multi-booth): ONE request for all selected booths, so the server can bill adjacent booths as one
  // contract (auto-merge, AGENTS.md §18). Nothing is painted before the server confirms; a booth that another
  // visitor just booked is taken out of the selection with a warning.
  const handleSuccessBooking = async (bookingData) => {
    const canvas = fabricRef.current;
    const bookedIds = Array.isArray(bookingData.boothIds) ? bookingData.boothIds : (bookingData.boothId ? [bookingData.boothId] : []);
    const bookedCodes = Array.isArray(bookingData.boothCodes) ? bookingData.boothCodes : (bookingData.boothCode ? [bookingData.boothCode] : []);
    const fpId = activeFpId || bookingData.floorplanId || floorplanData?.id || 'FP-2026-001';

    const res = await api.checkoutOrder({
      floorplanId: fpId,
      boothIds: bookedIds,
      boothCodes: bookedCodes,
      boothId: bookedIds[0],
      boothCode: bookedCodes[0],
      fullName: bookingData.fullName,
      brandName: bookingData.brandName,
      brandCategory: bookingData.brandCategory,
      email: bookingData.email,
      phone: bookingData.phone,
      totalAmount: bookingData.grandTotal,
      paidAmount: bookingData.paidAmount,
      remainingAmount: bookingData.remainingAmount,
      paymentType: bookingData.paymentType || 'full',
      downPaymentPercent: bookingData.dpPercent || (bookingData.paymentType === 'dp' ? 50 : 0),
      bookingType: bookingData.bookingType || 'booking',
      paymentMethod: bookingData.paymentMethod,
      transferBank: bookingData.transferBank || '',
      transferSenderName: bookingData.transferSenderName || '',
      notes: bookingData.notes || '',
      invoiceNumber: bookingData.invoiceNumber
    });

    if (!res?.success) {
      const gone = (res?.unavailable || []).map(c => String(c).trim().toLowerCase());
      if (gone.length) {
        const keep = (b) => !gone.includes(String(b.code || b.booth_number || '').trim().toLowerCase());
        const remaining = selectedBoothsRef.current.filter(keep);
        selectedBoothsRef.current = remaining;
        setSelectedBooths(remaining);
        selectedBoothObjsRef.current = selectedBoothObjsRef.current.filter(o => keep(o.boothData || {}));
        setCart(prev => prev.filter(keep));
      }
      lastStateStrRef.current = '';
      await loadFloorplan(null, { force: true });
      showToast(`⚠️ ${res?.error || 'Pemesanan gagal diproses. Silakan coba lagi.'}`);
      return { success: false, error: res?.error, unavailable: res?.unavailable || [] };
    }

    // Clear multi-selection & cart, then repaint from the database (statuses, tenant, merged booths)
    setSelectedBooths([]);
    selectedBoothsRef.current = [];
    selectedBoothObjsRef.current = [];
    setCart(prev => prev.filter(item => !bookedIds.includes(item.id) && !bookedCodes.includes(item.code)));
    lastStateStrRef.current = '';
    await loadFloorplan(null, { force: true });
    canvas?.requestRenderAll();

    const codesLabel = (res.order?.boothCodes || bookedCodes).join(', ');
    const merged = (res.order?.contracts || []).filter(c => c.codes.length > 1).map(c => mergeCodeLabel(c.codes));
    const mergeNote = merged.length ? ` Tampil tergabung: ${merged.join(', ')}.` : '';
    if (bookingData.paymentType === 'dp') {
      showToast(`🎉 Uang Muka (DP) tercatat. Booth ${codesLabel} di-reserve untuk ${bookingData.brandName}.${mergeNote}`);
    } else if (bookingData.bookingType === 'booking') {
      showToast(`🔖 Booth ${codesLabel} berhasil di-hold (Booking 24 Jam) untuk ${bookingData.brandName}.${mergeNote}`);
    } else if (bookingData.bookingType === 'manual_transfer') {
      showToast(`🏦 Pemesanan booth ${codesLabel} berhasil diajukan! Menunggu verifikasi mutasi.${mergeNote}`);
    } else {
      showToast(`🎉 Booth ${codesLabel} resmi terisi untuk ${bookingData.brandName}.${mergeNote}`);
    }
    return { success: true, order: res.order };
  };

  // Multi-booth selection preview: which selected booths touch each other (they will be shown merged)
  const selectionPreview = (() => {
    const canvas = fabricRef.current;
    if (!canvas || selectedBooths.length < 2) return null;
    const objs = selectedBooths
      .map(b => canvas.getObjects().find(o => o.isBooth && (o.boothData === b || (o.boothData?.code && o.boothData.code === b.code))))
      .filter(Boolean);
    const clusters = selectionClusters(canvas, objs);
    return {
      merged: clusters.filter(c => c.length > 1).map(c => ({
        label: mergeCodeLabel(c.map(o => o.boothData.code)),
        area: c.reduce((acc, o) => acc + (Number(o.boothData.widthM) || 0) * (Number(o.boothData.heightM) || 0), 0),
        price: c.reduce((acc, o) => acc + (Number(o.boothData.price) || 0), 0)
      })),
      separate: clusters.filter(c => c.length === 1).map(c => c[0].boothData.code)
    };
  })();

  const eventTitle = activeFpTitle || floorplanData?.event?.title || floorplanData?.title || (displayStats.total > 0 ? 'Expo Event' : 'Belum Ada Event Aktif');
  const eventVenue = activeFpVenue || floorplanData?.event?.venue || floorplanData?.venue || (displayStats.total > 0 ? 'Venue Hall' : 'Venue Belum Ditentukan');

  return (
    <div className="relative w-full h-full bg-slate-100 flex flex-col select-none overflow-hidden font-sans">
      {/* Top Banner & Quick Controls (Modern Light Theme) */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-6 py-2.5 z-30 flex items-center justify-between gap-3 shadow-xs">
        {isEmptyFloorplan ? (
          // Clean Empty/Brand State Header
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                <Building2 size={18} />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  ExpoPlanner
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                    Sistem Denah Pameran
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400">Pameran & Booking Booth Interaktif</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <a
                href="/admin/floorplan"
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
              >
                <Sparkles size={13} />
                <span>Buka Admin Studio</span>
              </a>
            </div>
          </div>
        ) : (
          // Active Floorplan Header with Search, Filters & Export
          <>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
                <Building2 size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate max-w-[240px] sm:max-w-md">
                    {currentEvent?.title || eventTitle}
                  </h2>
                  {allEvents && allEvents.length > 1 && (
                    <select
                      value={currentEvent?.id || ''}
                      onChange={(e) => handleSwitchEvent(e.target.value)}
                      className="bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200 text-indigo-700 text-[11px] font-bold rounded-lg px-2 py-0.5 focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[150px] truncate"
                      title="Pilih Event / Pameran Lain"
                    >
                      {allEvents.map((evt) => (
                        <option key={evt.id} value={evt.id}>
                          🏢 {evt.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 text-[10px] font-bold flex items-center gap-1.5 shadow-2xs shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    LIVE DENAH
                  </span>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                  <MapPin size={12} className="text-indigo-600 shrink-0" /> <span className="truncate">{eventVenue}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Multi-Booth Active Indicator Badge in Header */}
              {selectedBooths.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBookingModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-2.5 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all animate-pulse shrink-0 cursor-pointer"
                  title="Klik untuk proses booking booth yang dipilih"
                >
                  <Layers size={13} />
                  <span>{selectedBooths.length} Booth Dipilih</span>
                  <ArrowRight size={12} />
                </button>
              )}

              {/* Search Box */}
              <form onSubmit={handleSearchBooth} className="relative w-36 sm:w-48">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari Booth..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 hover:border-slate-400 focus:bg-white rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
                />
                {searchQuery && (
                  <button 
                    type="button" 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </form>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 hover:border-slate-400 focus:bg-white rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shadow-2xs max-w-[140px] truncate"
              >
                <option value="ALL">Semua Kategori {availableCategories.length > 0 ? `(${availableCategories.length})` : ''}</option>
                {availableCategories.map(({ name, count }) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 hover:border-slate-400 focus:bg-white rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shadow-2xs"
              >
                <option value="ALL">Semua Status</option>
                <option value="available">🟢 Tersedia</option>
                <option value="free">🔵 Free</option>
                <option value="reserved">🟡 Reserved</option>
                <option value="sold">🔴 Terjual</option>
              </select>

              {/* Export to PDF Button */}
              <button
                type="button"
                onClick={handleExportPdf}
                className="bg-white hover:bg-red-50 border border-slate-300 hover:border-red-300 text-slate-700 hover:text-red-600 rounded-xl px-2.5 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95 shrink-0"
                title="Unduh Dokumen Denah Pameran Resmi (PDF A4)"
              >
                <FileText size={13} className="text-red-500" />
                <span className="hidden md:inline">Unduh PDF</span>
              </button>

              {/* Admin Studio shortcut */}
              <a
                href="/admin/floorplan"
                className="bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 transition-all shadow-2xs shrink-0"
                title="Buka Admin Studio untuk mengedit denah"
              >
                <Sparkles size={12} className="text-indigo-600" />
                <span className="hidden lg:inline">Admin Studio</span>
              </a>
            </div>
          </>
        )}
      </header>

      {/* Sub-header: Interactive Hall Switcher Tab Bar */}
      {siblingHalls && siblingHalls.length > 1 && (
        <div className="bg-slate-50/95 border-b border-slate-200/90 px-4 sm:px-6 py-2 flex items-center justify-between gap-4 overflow-x-auto z-20 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <LayoutGrid size={13} className="text-indigo-600" /> Pilih Hall:
            </span>
            <div className="flex items-center gap-2">
              {siblingHalls.map((hall) => {
                const isActive = hall.id === activeFpId;
                return (
                  <button
                    key={hall.id}
                    onClick={() => handleSwitchHall(hall.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-2 ring-indigo-500/20'
                        : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-indigo-600 border border-slate-200/80 shadow-2xs'
                    }`}
                  >
                    <span>🏛️ {hall.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {hall.availableBooths !== undefined ? `${hall.availableBooths} Tersedia` : `${hall.totalBooths || 0} Booth`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="text-[11px] font-medium text-slate-400 hidden sm:block shrink-0">
            💡 Klik nama Hall untuk beralih denah ruangan pameran
          </div>
        </div>
      )}

      {/* Main Canvas Viewport with #F8FAFC Background */}
      <div className="flex-1 relative overflow-hidden bg-[#F8FAFC]" ref={containerRef}>
        {/* Subtle Luxury Architectural Grid on #F8FAFC */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />

        {/* Strict CSS to eliminate any canvas bounding box, focus outline, or browser selection */}
        <style>{`
          .canvas-container, .canvas-container canvas, canvas:focus, .canvas-container:focus {
            outline: none !important;
            border: none !important;
            box-shadow: none !important;
            user-select: none !important;
            -webkit-user-select: none !important;
          }
        `}</style>

        <canvas ref={canvasRef} />

        {/* Full element caption (hover on a shortened caption, or tap on an element icon) */}
        {captionTip && (
          <div
            className={`absolute z-30 px-2.5 py-1.5 rounded-lg shadow-lg text-xs font-semibold max-w-[260px] break-words ${captionTip.tapped ? 'bg-indigo-600 text-white pointer-events-auto' : 'bg-slate-900/90 text-white pointer-events-none'}`}
            style={{ left: captionTip.x + 12, top: captionTip.y + 14 }}
            onClick={() => { clearTimeout(captionTipTimerRef.current); captionFocusIdRef.current = null; setCaptionTip(null); fabricRef.current?.requestRenderAll(); }}
          >
            {captionTip.text}
          </div>
        )}

        {/* Floating Zoom & View Controls (Top Right) */}
        {!isEmptyFloorplan && (
          <div className="absolute top-4 right-4 flex flex-col gap-1 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/90 shadow-lg z-20">
            <button
              onClick={() => handleZoom(1.2)}
              title="Perbesar (Zoom In)"
              className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => handleZoom(1 / 1.2)}
              title="Perkecil (Zoom Out)"
              className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ZoomOut size={16} />
            </button>
            <div className="h-px bg-slate-200 my-0.5" />
            <button
              onClick={fitToScreen}
              title="Paskan ke Layar (Fit Screen)"
              className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <Maximize2 size={16} />
            </button>
            <button
              onClick={handleResetZoom}
              title="Reset Zoom (100%)"
              className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        )}

        {/* Public link that does not exist (anymore) */}
        {linkNotFound && (
          <div className="absolute inset-0 flex items-center justify-center p-6 z-30 bg-slate-50/80 backdrop-blur-sm">
            <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-4 text-2xl">🔗</div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Link Denah Tidak Ditemukan</h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-5">
                Denah pada link ini belum dipublikasikan atau publikasinya sudah dihentikan oleh panitia.
              </p>
              <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl">
                Lihat Denah Utama
              </a>
            </div>
          </div>
        )}

        {/* Clean Empty State Placeholder (ONLY when truly 0 booths and 0 floorplans exist and not loading) */}
        {isEmptyFloorplan && !isLoading && !linkNotFound && (
          <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none z-10">
            <div className="relative max-w-md w-full bg-white/95 rounded-3xl p-8 border border-slate-200/90 shadow-xl text-center flex flex-col items-center pointer-events-auto animate-fadeIn">
              <button
                type="button"
                onClick={() => setIsDismissedEmptyBanner(true)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                title="Tutup banner"
              >
                <X size={18} />
              </button>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
                <LayoutGrid size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Belum Ada Denah Pameran Aktif
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Database denah masih kosong atau belum dipublikasikan. Anda dapat membuka Admin Floorplan Studio untuk merancang dan mempublikasikan denah pameran.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                {/* Creating a floorplan requires a Studio-capable login (the API enforces this too) */}
                {canEditFloorplan && <button
                  type="button"
                  onClick={handleLoadStandardPreset}
                  disabled={isApplyingPreset}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles size={14} />
                  <span>{isApplyingPreset ? 'Memuat Denah...' : 'Muat Contoh Denah (12 Booth)'}</span>
                </button>}
                <a
                  href="/admin/floorplan"
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Building2 size={14} />
                  <span>Admin Studio</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Floating Hover Card (Instant preview on hover) */}
        {hoveredBooth && (() => {
          // Merged booth: one card for the whole group (full booth numbers on hover)
          const hoveredObj = fabricRef.current?.getObjects().find(o => o.boothData === hoveredBooth);
          const hGroup = hoveredObj && mergeTick >= 0 ? groupOfBooth(fabricRef.current, hoveredObj) : null;
          if (hGroup) {
            const owner = hGroup.members.map(m => m.boothData?.ownerName).find(Boolean) || '-';
            const tone = hGroup.status === 'partial' ? 'bg-sky-50 text-sky-800 border-sky-300' : hGroup.status === 'sold' ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-amber-50 text-amber-800 border-amber-300';
            return (
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl z-20 max-w-xs animate-fadeIn pointer-events-none">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Booth Gabungan • {hGroup.members.length} booth</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${tone}`}>{hGroup.status === 'partial' ? 'Sebagian Lunas' : MERGE_STATUS_LABELS[hGroup.status]}</span>
                </div>
                <div className="text-sm font-extrabold text-slate-900 break-words">{hGroup.codes.join('+')}</div>
                <div className="text-xs text-slate-600 mt-1">Brand: <b className="text-slate-900">{owner}</b></div>
                <div className="text-xs text-slate-600">Total luas: <b className="text-slate-900">{formatArea(hGroup.totalAreaM2)}</b></div>
                <div className="text-[10px] text-slate-400 mt-1.5">Klik untuk melihat rincian per booth</div>
              </div>
            );
          }
          const hStatus = String(hoveredBooth.status || 'available').trim().toLowerCase();
          const isAvail = hStatus === 'available';
          const isFree = hStatus === 'free';
          const isRes = hStatus === 'reserved';
          const isSold = hStatus === 'sold';
          const isSelected = selectedBooths.some(b => (b.id || b.code) === (hoveredBooth.id || hoveredBooth.code));

          return (
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl z-20 max-w-xs animate-fadeIn pointer-events-none">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-sm font-extrabold text-slate-900">Booth {hoveredBooth.code || hoveredBooth.booth_number}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                  isSelected
                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-400'
                    : isAvail
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                    : isFree
                    ? 'bg-blue-50 text-blue-700 border border-blue-300'
                    : isRes
                    ? 'bg-amber-50 text-amber-700 border border-amber-300'
                    : 'bg-rose-50 text-rose-700 border border-rose-300'
                }`}>
                  {isSelected
                    ? '✓ Terpilih (Multi-Booth)'
                    : isAvail 
                    ? '🟢 Tersedia (Klik Pilih)' 
                    : isFree
                    ? '🔵 Free Booth (Klik Pilih)'
                    : isRes 
                    ? '🟡 Reserved' 
                    : '🔴 Terjual'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Kategori: <b className="text-slate-800">{hoveredBooth.category || 'Standard'}</b>
                {hoveredBooth.shape && hoveredBooth.shape !== 'rectangle' && (
                  <> • Bentuk: <b className="text-indigo-600 font-semibold">{hoveredBooth.shape === 'rounded' ? 'Sudut Membulat' : hoveredBooth.shape === 'l_shape' ? 'Bentuk L' : hoveredBooth.shape === 'island_open' ? 'Pulau Terbuka' : hoveredBooth.shape === 'hexagon' ? 'Heksagon' : hoveredBooth.shape}</b></>
                )}
                {' '}• Ukuran: <b className="text-slate-800">{hoveredBooth.widthM || 3}x{hoveredBooth.heightM || 3}m</b>
              </p>
              {(isAvail || isFree) && (
                <div className="text-sm font-black text-emerald-600 mt-1.5 flex items-center justify-between">
                  <span>{isFree ? 'GRATIS (Free)' : `Rp ${(hoveredBooth.price || 5000000).toLocaleString('id-ID')}`}</span>
                  <span className={`text-[10px] font-bold flex items-center gap-0.5 ${isSelected ? 'text-amber-600' : 'text-indigo-600'}`}>
                    {isSelected ? 'Klik untuk melepas' : '+ Klik untuk memilih'} <ArrowRight size={10} />
                  </span>
                </div>
              )}
              {hoveredBooth.ownerName && (
                <p className="text-[11px] text-slate-600 mt-2 font-medium bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                  Tenant: <b>{hoveredBooth.ownerName}</b>
                </p>
              )}
            </div>
          );
        })()}

        {/* Floating Legend & Stats Bar (Bottom Left) */}
        {!isEmptyFloorplan && displayStats.total > 0 && (
          <div className="absolute bottom-5 left-5 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200/90 shadow-xl z-20 max-w-xs">
            <div className="flex items-center justify-between gap-4 mb-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-indigo-600" /> Status Denah Expo
              </h4>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">Total {displayStats.total} Unit</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between bg-emerald-50/60 px-2.5 py-1.5 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
                  <span className="text-emerald-900 font-semibold text-[11px]">Tersedia</span>
                </div>
                <span className="font-extrabold text-emerald-700 text-xs">{displayStats.available} booth ({displayStats.total > 0 ? Math.round((displayStats.available / displayStats.total) * 100) : 0}%)</span>
              </div>

              {displayStats.free > 0 && (
                <div className="flex items-center justify-between bg-blue-50/60 px-2.5 py-1.5 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50"></span>
                    <span className="text-blue-900 font-semibold text-[11px]">Free (Additional)</span>
                  </div>
                  <span className="font-extrabold text-blue-700 text-xs">{displayStats.free} booth</span>
                </div>
              )}

              <div className="flex items-center justify-between bg-amber-50/60 px-2.5 py-1.5 rounded-xl border border-amber-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50"></span>
                  <span className="text-amber-900 font-semibold text-[11px]">Reserved</span>
                </div>
                <span className="font-extrabold text-amber-700 text-xs">{displayStats.reserved} booth</span>
              </div>

              <div className="flex items-center justify-between bg-rose-50/60 px-2.5 py-1.5 rounded-xl border border-rose-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm"></span>
                  <span className="text-rose-900 font-semibold text-[11px]">Terjual</span>
                </div>
                <span className="font-extrabold text-rose-700 text-xs">{displayStats.sold} booth</span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
              <Sparkles size={12} className="text-emerald-600 shrink-0" />
              <span>Klik beberapa booth hijau/biru untuk booking multi-booth sekaligus.</span>
            </div>
          </div>
        )}

        {/* Floating Multi-Selection Action Bar */}
        {selectedBooths.length > 0 && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-3 bg-slate-950/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-indigo-500/40 animate-fadeIn max-w-[94vw] sm:max-w-3xl">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                <Layers size={16} />
              </div>
              <div>
                <div className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                  <span>{selectedBooths.length} Booth Dipilih</span>
                  <span className="bg-indigo-500/30 text-indigo-200 text-[9px] px-1.5 py-0.2 rounded font-mono">
                    {selectedBooths.reduce((s, b) => s + ((b.widthM || 3) * (b.heightM || 3)), 0)} m²
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Klik booth untuk tambah / lepas
                </div>
              </div>
            </div>

            {/* Selected Booth Chips */}
            <div className="flex items-center gap-1.5 flex-wrap max-h-16 overflow-y-auto px-1 py-0.5">
              {selectedBooths.map(b => (
                <span
                  key={b.id || b.code}
                  className="inline-flex items-center gap-1 bg-indigo-900/80 hover:bg-indigo-800 border border-indigo-500/50 text-indigo-100 text-xs font-bold px-2 py-0.5 rounded-lg transition-colors shadow-xs"
                >
                  {b.code || b.booth_number}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeselectBooth(b);
                    }}
                    title={`Hapus ${b.code || b.booth_number}`}
                    className="text-indigo-300 hover:text-white ml-0.5 p-0.5 hover:bg-indigo-700/60 rounded cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>

            {/* Auto-merge preview: adjacent selected booths will be shown as one booth after booking */}
            {selectionPreview && (
              <div className="w-full text-[11px] leading-snug space-y-0.5">
                {selectionPreview.merged.map(m => (
                  <div key={m.label} className="text-emerald-300">
                    🔗 <b>{m.label}</b> bersebelahan: akan tampil sebagai <b>satu booth gabungan</b> • {formatArea(m.area)} • Rp {m.price.toLocaleString('id-ID')}
                  </div>
                ))}
                {selectionPreview.separate.length > 0 && (
                  <div className="text-amber-300">
                    ℹ️ Booth {selectionPreview.separate.join(', ')} tidak bersebelahan dengan booth pilihan lain: akan tampil sebagai booth terpisah.
                  </div>
                )}
              </div>
            )}

            <div className="w-px h-8 bg-slate-800 hidden sm:block" />

            <div className="text-right ml-auto sm:ml-0">
              <div className="text-[10px] text-indigo-300 font-medium">Total Harga</div>
              <div className="text-sm font-black text-emerald-400 font-mono">
                {selectedBooths.some(b => b.status === 'free')
                  ? selectedBooths.every(b => b.status === 'free') ? 'GRATIS' : `Rp ${selectedBooths.filter(b => b.status !== 'free').reduce((s, b) => s + (b.price || 5000000), 0).toLocaleString('id-ID')}`
                  : `Rp ${selectedBooths.reduce((s, b) => s + (b.price || 5000000), 0).toLocaleString('id-ID')}`
                }
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto sm:ml-0">
              <button
                onClick={() => setShowBookingModal(true)}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 shadow-lg shadow-emerald-900/40 cursor-pointer"
              >
                <span>Pesan Sekarang ({selectedBooths.length})</span>
                <ArrowRight size={14} />
              </button>

              <button
                onClick={handleAddSelectedToCart}
                className="p-2 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 hover:text-white rounded-xl border border-indigo-600/40 transition-colors cursor-pointer"
                title="Masukkan semua ke keranjang"
              >
                <ShoppingCart size={16} />
              </button>

              <button
                onClick={handleClearAllSelections}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                title="Batalkan Semua Pilihan"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Floating Cart Button (Bottom Right) */}
        {!isEmptyFloorplan && displayStats.total > 0 && (
          <button 
            onClick={() => setIsCartOpen(true)}
            className="absolute bottom-5 right-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-3.5 rounded-2xl shadow-xl shadow-indigo-500/25 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2.5 z-20 group border border-indigo-400/30"
          >
            <div className="relative">
              <ShoppingCart size={20} className="group-hover:rotate-6 transition-transform" />
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-black w-4 h-4 flex items-center justify-center rounded-full border-2 border-white animate-bounce">
                  {cart.length}
                </span>
              )}
            </div>
            <span className="text-xs font-bold">Keranjang ({cart.length})</span>
          </button>
        )}
      </div>

      {/* Floating Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-xl shadow-2xl text-xs font-medium backdrop-blur-md flex items-center gap-2 animate-fadeIn border border-slate-700">
          <Info size={14} className="text-indigo-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Booth Detail, Form Registrasi, dan Payment Modal */}
      {showBookingModal && selectedBooths.length > 0 && (
        <BookingModal 
          booths={selectedBooths}
          projectId={activeFpId || floorplanData?.id || new URLSearchParams(window.location.search).get('templateId') || new URLSearchParams(window.location.search).get('project') || 'FP-2026-001'}
          isPaymentActive={systemConfig.isPaymentActive !== false}
          onClose={() => {
            setShowBookingModal(false);
            loadFloorplan(null, { force: true });
          }} 
          onSuccessBooking={handleSuccessBooking}
        />
      )}

      {/* Merged booth detail (click on a merged booth) */}
      {groupDetail && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" onClick={() => setGroupDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Booth Gabungan • {groupDetail.members.length} booth</div>
                <div className="text-base font-extrabold break-words">{groupDetail.codes.join('+')}</div>
                <div className="text-xs text-slate-300 mt-0.5">{groupDetail.members.map(m => m.boothData?.ownerName).find(Boolean) || '-'}</div>
              </div>
              <button type="button" onClick={() => setGroupDetail(null)} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200"><div className="text-slate-500">Total Luas</div><div className="text-base font-extrabold text-slate-900">{formatArea(groupDetail.totalAreaM2)}</div></div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200"><div className="text-slate-500">Status</div><div className="text-base font-extrabold text-slate-900">{groupDetail.status === 'partial' ? 'Sebagian Lunas' : MERGE_STATUS_LABELS[groupDetail.status]}</div></div>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="py-1.5">Booth</th><th>Ukuran</th><th>Luas</th><th>Status</th></tr></thead>
                <tbody>
                  {groupDetails(groupDetail).map(d => (
                    <tr key={d.code} className="border-b border-slate-100">
                      <td className="py-1.5 font-bold text-slate-900">{d.code}</td>
                      <td>{d.widthM}×{d.heightM} m</td>
                      <td>{formatArea(d.areaM2)}</td>
                      <td className={d.status === 'sold' ? 'text-rose-600 font-semibold' : 'text-amber-600 font-semibold'}>{d.status === 'sold' ? 'Sold (Lunas)' : 'Reserved'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      {isCartOpen && (
        <CartDrawer 
          cart={cart} 
          onClose={() => setIsCartOpen(false)} 
          onRemove={(id) => setCart(cart.filter(c => c.id !== id))}
          onCheckout={(boothItem) => {
            setIsCartOpen(false);
            setSelectedBooths([boothItem]);
            setShowBookingModal(true);
          }}
        />
      )}
    </div>
  );
}

