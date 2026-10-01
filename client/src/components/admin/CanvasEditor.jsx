import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as fabric from 'fabric';
import { 
  DEFAULT_GRID_SCALE,
  createBoothObject, 
  createVenueObject, 
  createBasicShapeObject,
  updateBoothAppearance,
  normalizeScaledObject,
  exportToPRDJson,
  BOOTH_CATEGORIES,
  snapCoords,
  hydrateBoothObject
} from '../../utils/floorplanUtils';
import { exportFloorplanToPdf } from '../../utils/floorplanPdfExport';
import { createDoorObject, rebuildDoorObject, snapDoorToWall, applyDoorBehavior } from '../../utils/doorSymbols';
import {
  ELEMENTS, isLibraryElement, createLibraryElement, rebuildLibraryElement, placeOnLayer, snapGateToWallOrDoor,
  connectQueueEnds, findPillarConflicts, applyLibraryBehavior, elementCenter, isShapeElement, syncShapeElement, applyShapeStyle
} from '../../utils/elementLibrary';
import { drawElementCaptions, findCaptionHit } from '../../utils/elementCaptions';
import {
  SNAP_SCREEN_PX, boxOf, containsBooth, snapTargets, computeSnap, computeGuides, limitStepToTouch, findBoothOverlaps, roundToStep,
  elementSnapTargets, movingGeometry, snapLineEnds, snapPoint
} from '../../utils/boothSnap';
import CanvasRuler from './CanvasRuler';
import { COPY_PROPS, prepareCopy } from '../../utils/copyRules';

import { safeSet, safeGetJson, safeRemove } from '../../utils/safeStorage';
const CLIPBOARD_KEY = 'floorplan_canvas_clipboard';
// A copy too large for localStorage stays in this tab's memory
let memoryClipboard = null;
// Undo / redo keeps the last 20 states (in memory only, never in browser storage)
const MAX_HISTORY_STEPS = 20;
// Booth hover glow (editor-only state) and the shadow a booth has at rest
const BOOTH_HOVER_SHADOW = { color: 'rgba(59, 130, 246, 0.45)', blur: 16, offsetX: 0, offsetY: 3 };
const BOOTH_REST_SHADOW = { color: 'rgba(0,0,0,0.06)', blur: 6, offsetX: 0, offsetY: 2 };

const CanvasEditor = forwardRef(function CanvasEditor({
  onSelectionChange,
  onObjectsUpdate,
  snapToGrid = true,
  showGrid = true,
  showRuler = true,
  showDimensions = false,
  gridScale = DEFAULT_GRID_SCALE, // 1 kotak grid = 1 meter (default 20px)
  isPanMode = false,
  zoomLevel = 1,
  onZoomChange,
  blueprintData = null,
  onBlueprintLoaded,
  isPreviewMode = false,
  // Read-only Studio (Sales): same locked canvas as the preview, with its own notice
  readOnlyNotice = false,
  // Read-only Studio (Sales): a click on any booth opens the action pop up (booth data + the click position on the
  // screen); `highlightBoothCode` outlines the booth whose pop up is open
  onBoothAction,
  highlightBoothCode = null,
  onHistoryChange,
  onOpenBookingForBooth,
  onOpenInvoiceForBooth,
  onWarning,
  showCaptions = true,
  // Operational floorplan: called after every canvas (re)load incl. undo/redo, so the page can re-apply layer locks
  onStateLoaded,
  // Hide rental prices in the preview hover card (operations team)
  hidePrices = false,
  // Snap sesama booth (Denah Sales only): booth edges & corners, optionally walls & pillars.
  // For elements (everything that is not a booth, Sales & Operasional): "Snap ke Booth" = booths are anchors.
  snapToBooths = false,
  snapToWalls = false,
  // Snap ke Elemen: elements stick to / line up with other elements of every layer (AGENTS.md §25)
  snapToElements = false,
  // Red marks on overlapping booths while snapping (off in Denah Operasional, where booths are locked)
  markBoothOverlaps = true,
  // 'sales' (Floorplan Studio) or 'ops' (Denah Operasional: copies join the operational layer, no booth copies)
  layerMode = 'sales'
}, ref) {
  const containerRef = useRef(null);
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const blueprintObjRef = useRef(null);
  const blueprintDataRef = useRef(blueprintData);
  blueprintDataRef.current = blueprintData;
  const [blueprintRetryTick, setBlueprintRetryTick] = useState(0);
  const blueprintLoadSeqRef = useRef(0);
  const isSpacePressedRef = useRef(false);

  // Viewport & Cursor state for Rulers
  const [viewportTransform, setViewportTransform] = useState([1, 0, 0, 1, 0, 0]);
  const [containerDimensions, setContainerDimensions] = useState({ width: 900, height: 600 });
  const [mousePos, setMousePos] = useState({ x: -100, y: -100 });
  const [activeDimension, setActiveDimension] = useState(null);
  const [hoveredBooth, setHoveredBooth] = useState(null);

  // Undo / Redo History Stack
  const historyStackRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const isStateRestoringRef = useRef(false);
  const handleSelectionRef = useRef(null);
  const handleDropRef = useRef(null);

  // Latest props refs for event listener closures
  const snapToGridRef = useRef(snapToGrid);
  const showDimensionsRef = useRef(showDimensions);
  const gridScaleRef = useRef(gridScale);
  const isPanModeRef = useRef(isPanMode);
  const isPreviewModeRef = useRef(isPreviewMode);
  const onBoothActionRef = useRef(onBoothAction);
  const highlightBoothCodeRef = useRef(highlightBoothCode);
  useEffect(() => { onBoothActionRef.current = onBoothAction; }, [onBoothAction]);
  useEffect(() => {
    highlightBoothCodeRef.current = highlightBoothCode;
    fabricRef.current?.requestRenderAll();
  }, [highlightBoothCode]);
  const showCaptionsRef = useRef(showCaptions);
  const snapToBoothsRef = useRef(snapToBooths);
  snapToBoothsRef.current = snapToBooths;
  const snapToWallsRef = useRef(snapToWalls);
  snapToWallsRef.current = snapToWalls;
  const snapToElementsRef = useRef(snapToElements);
  snapToElementsRef.current = snapToElements;
  const markBoothOverlapsRef = useRef(markBoothOverlaps);
  markBoothOverlapsRef.current = markBoothOverlaps;
  const layerModeRef = useRef(layerMode);
  layerModeRef.current = layerMode;
  // Last pointer position on the canvas (scene coords): Ctrl/Cmd + V pastes there
  const lastPointerRef = useRef(null);
  const addCopiesRef = useRef(null);
  // Anchors of the element being dragged (computed once per drag, cleared on release)
  const elementSnapCacheRef = useRef(null);
  const elementSnapOn = () => snapToBoothsRef.current || snapToElementsRef.current;
  const elementTargetsFor = (canvas, target) => {
    const cache = elementSnapCacheRef.current;
    if (cache && cache.target === target) return cache.targets;
    const targets = elementSnapTargets(canvas, target, { booths: snapToBoothsRef.current, elements: snapToElementsRef.current });
    elementSnapCacheRef.current = { target, targets };
    return targets;
  };
  const onWarningRef = useRef(onWarning);
  onWarningRef.current = onWarning;
  // Smart guides of the booth being moved / resized ({ lines, distance }), cleared when it is released
  const snapGuidesRef = useRef(null);
  const onStateLoadedRef = useRef(onStateLoaded);
  onStateLoadedRef.current = onStateLoaded;
  const captionHitsRef = useRef([]);
  const [captionTip, setCaptionTip] = useState(null);

  useEffect(() => {
    snapToGridRef.current = snapToGrid;
    showDimensionsRef.current = showDimensions;
    gridScaleRef.current = gridScale;
    isPanModeRef.current = isPanMode;
    isPreviewModeRef.current = isPreviewMode;
  }, [snapToGrid, showDimensions, gridScale, isPanMode, isPreviewMode]);

  // Global "Tampilkan Semua Caption" switch
  useEffect(() => {
    showCaptionsRef.current = showCaptions;
    if (!showCaptions) setCaptionTip(null);
    fabricRef.current?.requestRenderAll();
  }, [showCaptions]);

  // Handle Preview Mode Toggle in Studio: lock objects and remove bounding boxes
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (isPreviewMode) {
      canvas.discardActiveObject();
      canvas._activeObject = undefined;
      canvas.selection = false;
      canvas.defaultCursor = 'grab';
      canvas.skipControlsDrawing = true;

      if (!canvas._origMethods) {
        canvas._origMethods = {
          setActiveObject: canvas.setActiveObject,
          _setActiveObject: canvas._setActiveObject,
          getActiveObject: canvas.getActiveObject,
          getActiveObjects: canvas.getActiveObjects,
          _setupCurrentTransform: canvas._setupCurrentTransform,
          drawControls: canvas.drawControls
        };
      }
      canvas.setActiveObject = function() { this._activeObject = undefined; return this; };
      canvas._setActiveObject = function() { this._activeObject = undefined; return false; };
      canvas.getActiveObject = function() { return null; };
      canvas.getActiveObjects = function() { return []; };
      canvas._setupCurrentTransform = function() { this._currentTransform = null; return false; };
      canvas.drawControls = function() {};

      canvas.getObjects().forEach(obj => {
        if (obj.isBackgroundBlueprint) return;
        obj._dragStartX = obj.left;
        obj._dragStartY = obj.top;
        obj.set({
          selectable: false,
          evented: true,
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
          activeOn: 'none',
          hoverCursor: (obj.boothData?.status === 'available' || obj.boothData?.status === 'free') ? 'pointer' : 'default'
        });
        obj.drawBorders = function() {};
        obj.drawControls = function() {};
        obj._renderControls = function() {};
        if (typeof obj.forEachObject === 'function') {
          obj.forEachObject(child => {
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
      });
      canvas.requestRenderAll();
    } else {
      canvas.skipControlsDrawing = false;
      if (canvas._origMethods) {
        canvas.setActiveObject = canvas._origMethods.setActiveObject;
        canvas._setActiveObject = canvas._origMethods._setActiveObject;
        canvas.getActiveObject = canvas._origMethods.getActiveObject;
        canvas.getActiveObjects = canvas._origMethods.getActiveObjects;
        canvas._setupCurrentTransform = canvas._origMethods._setupCurrentTransform;
        canvas.drawControls = canvas._origMethods.drawControls;
      }
      canvas.selection = !isPanMode;
      canvas.defaultCursor = isPanMode ? 'grab' : 'default';

      canvas.getObjects().forEach(obj => {
        if (obj.isBackgroundBlueprint) return;
        const isLocked = Boolean(obj.isLocked);
        delete obj.drawBorders;
        delete obj.drawControls;
        delete obj._renderControls;
        obj.set({
          selectable: !isLocked,
          evented: true,
          hasControls: !isLocked,
          hasBorders: !isLocked,
          borderColor: '#3b82f6',
          cornerColor: '#ffffff',
          cornerStrokeColor: '#3b82f6',
          lockMovementX: isLocked,
          lockMovementY: isLocked,
          lockRotation: isLocked,
          lockScalingX: isLocked,
          lockScalingY: isLocked,
          activeOn: 'down',
          hoverCursor: isLocked ? 'not-allowed' : 'move'
        });
        // Preview mode emptied the controls: give every object its default handles back
        if (obj.constructor?.createControls) obj.controls = obj.constructor.createControls().controls;
        if (obj.venueData?.type === 'door' && !isLocked) applyDoorBehavior(obj);
        if (isLibraryElement(obj)) applyLibraryBehavior(obj);
      });
      canvas.requestRenderAll();
    }
  }, [isPreviewMode, isPanMode]);

  // Helper to push history state
  const styleHistoryTimerRef = useRef(null);
  // Size badge (metres) shown while a Text Box / Bentuk is being resized, whatever the "Dimensi" switch says
  const [shapeResizeBadge, setShapeResizeBadge] = useState(null);
  const pushHistory = useCallback(() => {
    if (isStateRestoringRef.current) return;
    const canvas = fabricRef.current;
    if (!canvas) return;

    const json = canvas.toObject([
      'isBooth', 
      'boothData', 
      'isVenueItem', 
      'venueData', 
      'isCustomGroup',
      'isBackgroundBlueprint',
      'blueprintData',
      'strokeUniform',
      'noScaleCache',
      'id',
      'name',
      'src',
      'isLocked',
      'isOpsItem',
      'isSalesLayer',
      'opsOrigOpacity',
      'isBasicShape',
      'shapeType'
    ]);

    const newStack = historyStackRef.current.slice(0, historyIndexRef.current + 1);
    newStack.push(json);
    while (newStack.length > MAX_HISTORY_STEPS) newStack.shift();
    
    historyStackRef.current = newStack;
    historyIndexRef.current = newStack.length - 1;

    onHistoryChange?.({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyStackRef.current.length - 1
    });
  }, [onHistoryChange]);

  const loadHistoryState = useCallback((stateJson, dbBooths = []) => {
    const canvas = fabricRef.current;
    if (!canvas || !stateJson) return;

    let parsedState = stateJson;
    if (typeof parsedState === 'string') {
      try {
        parsedState = JSON.parse(parsedState);
      } catch (e) {
        console.error("Failed to parse stateJson in loadHistoryState", e);
        return;
      }
    }

    isStateRestoringRef.current = true;
    return canvas.loadFromJSON(parsedState).then(() => {
      // Re-apply crisp vector properties and hydrate booth & blueprint metadata on all objects
      canvas.getObjects().forEach((obj, idx) => {
        const raw = parsedState?.objects?.[idx];
        if (raw?.isBackgroundBlueprint) {
          obj.isBackgroundBlueprint = true;
          if (raw.blueprintData) {
            obj.blueprintData = { ...raw.blueprintData };
          }
          if (raw.src && !obj.src) {
            obj.src = raw.src;
          }
        }
        hydrateBoothObject(obj, raw, dbBooths);
        obj.set({
          strokeUniform: true,
          noScaleCache: true,
          objectCaching: false
        });
        obj.dirty = true;
      });

      const bp = canvas.getObjects().find(o => o.isBackgroundBlueprint);
      blueprintObjRef.current = bp || null;

      if (bp) {
        // Legacy saves lost blueprintData on the canvas object; recover it from the floorplan's blueprint record
        const bpSrc = bp.getSrc?.() || bp._element?.src || bp.src || '';
        const savedBp = blueprintDataRef.current;
        if (!bp.blueprintData && savedBp?.url && savedBp.url === bpSrc) {
          bp.blueprintData = { ...savedBp, x: bp.left ?? 0, y: bp.top ?? 0 };
        }
        const bpInfo = bp.blueprintData || {
          url: bp.getSrc?.() || bp._element?.src || bp.src || '',
          name: bp.blueprintData?.name || 'Contoh Denah – JCC Convention Hall',
          sourceType: bp.blueprintData?.sourceType || 'sample',
          opacity: bp.opacity ?? 0.35,
          scale: bp.scaleX ?? 1,
          isLocked: bp.selectable === false && bp.evented === false,
          x: bp.left ?? 0,
          y: bp.top ?? 0
        };
        onBlueprintLoaded?.(bpInfo);
      }

      onStateLoadedRef.current?.(canvas);
      canvas.requestRenderAll();
      isStateRestoringRef.current = false;
      refreshPillarConflicts();

      // Canvas JSON had no blueprint object but the floorplan has one: re-apply it now that loading is done
      if (!bp && blueprintDataRef.current?.url) {
        setBlueprintRetryTick(t => t + 1);
      }

      // Reset history stack for this loaded template
      historyStackRef.current = [parsedState];
      historyIndexRef.current = 0;
      onHistoryChange?.({
        canUndo: false,
        canRedo: false
      });

      notifyObjectsUpdate();
      onSelectionChange?.(null, []);
    }).catch(err => {
      console.error("Error loading JSON into Fabric canvas:", err);
      isStateRestoringRef.current = false;
    });
  }, [onSelectionChange, onBlueprintLoaded, onHistoryChange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getCanvas: () => fabricRef.current,
    loadHistoryState,

    // Record a change made directly on canvas objects by the page (Layers list + undo history)
    recordChange: () => {
      fabricRef.current?.requestRenderAll();
      notifyObjectsUpdate();
      pushHistory();
    },

    // Centre the view on a scene point (e.g. "Perubahan dari Sales" item)
    focusPoint: (x, y, zoom) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const z = zoom || Math.max(canvas.getZoom(), 1.2);
      const vpt = [z, 0, 0, z, canvas.width / 2 - x * z, canvas.height / 2 - y * z];
      canvas.setViewportTransform(vpt);
      onZoomChange?.(z);
      setViewportTransform([...vpt]);
      canvas.requestRenderAll();
    },
    getBlueprintData: () => {
      const bp = blueprintObjRef.current || fabricRef.current?.getObjects().find(o => o.isBackgroundBlueprint);
      if (!bp) return null;
      const bpData = bp.blueprintData || {};
      const url = bp.getSrc?.() || bp._element?.src || bp.src || bpData.url || '';
      if (!url) return null;
      return {
        ...bpData,
        url,
        name: bpData.name || (bpData.sourceType === 'upload' ? 'File Cetak Biru' : 'Contoh Denah – JCC Convention Hall'),
        sourceType: bpData.sourceType || (url.includes('svg') || url.includes('JCC') ? 'sample' : 'upload'),
        opacity: bp.opacity ?? 0.35,
        scale: bp.scaleX ?? 1,
        isLocked: bp.selectable === false && bp.evented === false,
        x: bp.left ?? 0,
        y: bp.top ?? 0
      };
    },
    
    // Add new booth
    addBooth: (params = {}) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const centerX = (canvas.width / 2 - vpt[4]) / vpt[0];
      const centerY = (canvas.height / 2 - vpt[5]) / vpt[3];

      const existingBooths = canvas.getObjects().filter(o => o.isBooth);
      const nextNum = existingBooths.length + 1;
      const code = `A-${String(nextNum).padStart(2, '0')}`;

      const category = params.category || 'Standard';
      const catConfig = BOOTH_CATEGORIES[category] || BOOTH_CATEGORIES.Standard;
      const widthM = params.widthM || catConfig?.widthM || 3;
      const heightM = params.heightM || catConfig?.heightM || 3;
      const price = params.price !== undefined ? params.price : (catConfig?.defaultPrice || 5000000);

      // Stagger placement offset so new booths don't stack directly on top of each other
      const offsetIdx = existingBooths.length % 12;
      const col = offsetIdx % 4;
      const row = Math.floor(offsetIdx / 4);
      const offsetX = (col - 1.5) * (gridScale * 3.5);
      const offsetY = (row - 1) * (gridScale * 3.5);
      const targetX = centerX + offsetX;
      const targetY = centerY + offsetY;

      const shape = params.shape || 'rectangle';
      const booth = createBoothObject({
        code,
        category,
        shape,
        price,
        widthM,
        heightM,
        gridScale,
        left: snapToGrid ? Math.round(targetX / gridScale) * gridScale : targetX,
        top: snapToGrid ? Math.round(targetY / gridScale) * gridScale : targetY,
        ownerName: params.ownerName || ''
      });

      canvas.add(booth);
      canvas.bringObjectToFront(booth);
      canvas.setActiveObject(booth);
      canvas.requestRenderAll();
      handleSelectionRef.current?.();
      notifyObjectsUpdate();
      pushHistory();
    },

    // Add a library element (Struktur, Zona, Tiket & Akses, Utilitas, Signage, Operasional, ...) at the view centre
    addLibraryElement: (type) => {
      const canvas = fabricRef.current;
      if (!canvas || !ELEMENTS[type]) return;
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const cx = (canvas.width / 2 - vpt[4]) / vpt[0];
      const cy = (canvas.height / 2 - vpt[5]) / vpt[3];
      const el = createLibraryElement(type, { cx, cy, gridScale: gridScaleRef.current });
      if (ELEMENTS[type].snapToWall) snapGateToWallOrDoor(el, canvas, gridScaleRef.current);
      canvas.add(el);
      placeOnLayer(canvas, el);
      canvas.setActiveObject(el);
      canvas.requestRenderAll();
      handleSelectionRef.current?.();
      refreshPillarConflicts();
      notifyObjectsUpdate();
      pushHistory();
    },

    // Layers panel: show / hide an element on the canvas (saved; hidden elements are hidden in Live too)
    toggleObjectVisibility: (obj) => {
      const canvas = fabricRef.current;
      if (!canvas || !obj) return;
      obj.set({ visible: obj.visible === false });
      if (obj.visible === false && canvas.getActiveObject() === obj) canvas.discardActiveObject();
      canvas.requestRenderAll();
      refreshPillarConflicts();
      notifyObjectsUpdate();
      handleSelectionRef.current?.();
      pushHistory();
    },

    // Layers panel: lock / unlock an element's position
    toggleObjectLock: (obj) => {
      const canvas = fabricRef.current;
      if (!canvas || !obj) return;
      obj.isLocked = !obj.isLocked;
      const locked = obj.isLocked;
      if (locked && canvas.getActiveObject() === obj) canvas.discardActiveObject();
      obj.set({
        selectable: !locked, hasControls: !locked, hasBorders: !locked,
        lockMovementX: locked, lockMovementY: locked, lockRotation: locked, lockScalingX: locked, lockScalingY: locked,
        hoverCursor: locked ? 'not-allowed' : 'move'
      });
      if (!locked) {
        if (obj.constructor?.createControls) obj.controls = obj.constructor.createControls().controls;
        if (obj.venueData?.type === 'door') applyDoorBehavior(obj);
        if (isLibraryElement(obj)) applyLibraryBehavior(obj);
      }
      canvas.requestRenderAll();
      notifyObjectsUpdate();
      handleSelectionRef.current?.();
      pushHistory();
    },

    // Add door symbol at the centre of the visible canvas (snaps onto a nearby wall)
    addDoor: ({ doorType = 'single', widthM } = {}) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const centerX = (canvas.width / 2 - vpt[4]) / vpt[0];
      const centerY = (canvas.height / 2 - vpt[5]) / vpt[3];
      const door = createDoorObject({ doorType, widthM, cx: centerX, cy: centerY, gridScale: gridScaleRef.current });
      snapDoorToWall(door, canvas, gridScaleRef.current);

      canvas.add(door);
      canvas.bringObjectToFront(door);
      canvas.setActiveObject(door);
      canvas.requestRenderAll();
      handleSelectionRef.current?.();
      notifyObjectsUpdate();
      pushHistory();
    },

    // Add venue item
    addVenueItem: (type, customLabel) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const centerX = (canvas.width / 2 - vpt[4]) / vpt[0];
      const centerY = (canvas.height / 2 - vpt[5]) / vpt[3];

      const venueItem = createVenueObject({
        type,
        gridScale,
        left: snapToGrid ? Math.round(centerX / gridScale) * gridScale : centerX,
        top: snapToGrid ? Math.round(centerY / gridScale) * gridScale : centerY,
        customLabel
      });

      canvas.add(venueItem);
      canvas.setActiveObject(venueItem);
      canvas.requestRenderAll();
      handleSelectionRef.current?.();
      notifyObjectsUpdate();
      pushHistory();
    },

    // Add basic shape (from 11-shape palette)
    addBasicShape: (shapeId) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const centerX = (canvas.width / 2 - vpt[4]) / vpt[0];
      const centerY = (canvas.height / 2 - vpt[5]) / vpt[3];

      const shape = createBasicShapeObject(shapeId, {
        gridScale,
        left: snapToGrid ? Math.round(centerX / gridScale) * gridScale : centerX,
        top: snapToGrid ? Math.round(centerY / gridScale) * gridScale : centerY
      });

      canvas.add(shape);
      canvas.setActiveObject(shape);
      canvas.requestRenderAll();
      handleSelectionRef.current?.();
      notifyObjectsUpdate();
      pushHistory();
    },

    // Update single object property
    updateActiveProperty: (newProps) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;

      // Caption text / visibility: stored on the element data only (the overlay redraws it), no rebuild
      if (active.isVenueItem && active.venueData && ('caption' in newProps || 'showCaption' in newProps)) {
        const { caption, showCaption, ...rest } = newProps;
        if (caption !== undefined) {
          const text = String(caption || '').trim();
          active.venueData.caption = text;
          // library elements & doors keep the custom caption as their label (Layers panel, exports)
          if (active.venueData.lib || active.venueData.type === 'door') active.venueData.label = text;
        }
        if (showCaption !== undefined) active.venueData.showCaption = Boolean(showCaption);
        newProps = rest;
        if (!Object.keys(rest).length) {
          canvas.requestRenderAll();
          notifyObjectsUpdate();
          handleSelectionRef.current?.();
          pushHistory();
          return;
        }
      }

      if (active.isBooth) {
        updateBoothAppearance(active, newProps);
        // "Arah Nama Tenant" of a merged booth applies to the whole group (one name is drawn for all of them)
        if ('nameDirection' in newProps) {
          const mergeGroup = (canvas.__mergeGroups || []).find(g => g.active && g.members.includes(active));
          mergeGroup?.members.forEach(m => { if (m !== active) updateBoothAppearance(m, { nameDirection: newProps.nameDirection }); });
        }
      } else if (active.venueData?.type === 'door') {
        // Type, width, hinge side, swing, label and angle change the drawing: rebuild in place (same id & position)
        canvas.setActiveObject(rebuildDoorObject(canvas, active, newProps));
      } else if (isLibraryElement(active)) {
        const { publicVisible, ...changes } = newProps;
        if (publicVisible !== undefined) active.venueData.publicVisible = Boolean(publicVisible);
        if (Object.keys(changes).length) {
          const next = rebuildLibraryElement(canvas, active, changes);
          if (ELEMENTS[next.venueData.type].snapToWall && (changes.widthM !== undefined || changes.angle !== undefined)) {
            snapGateToWallOrDoor(next, canvas, gridScaleRef.current);
          }
          canvas.setActiveObject(next);
        }
        refreshPillarConflicts();
      } else if (active.isVenueItem) {
        active.venueData = { ...active.venueData, ...newProps };
        const labelObj = active.getObjects?.()?.[1];
        if (labelObj && newProps.label) {
          labelObj.set({ text: newProps.label });
        }
      } else if (active.isBasicShape) {
        if (newProps.fill !== undefined) active.set('fill', newProps.fill);
        if (newProps.stroke !== undefined) active.set('stroke', newProps.stroke);
        if (newProps.strokeWidth !== undefined) active.set('strokeWidth', newProps.strokeWidth);
        if (newProps.opacity !== undefined) active.set('opacity', newProps.opacity);
        if (newProps.angle !== undefined) active.set('angle', newProps.angle);
      }
      canvas.requestRenderAll();
      notifyObjectsUpdate();
      handleSelectionRef.current?.();
      pushHistory();
    },

    // Batch update
    // Text Box & Bentuk colours for the selected element(s): shown live, one undo step per burst of changes
    applyShapeStyle: (style) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const targets = canvas.getActiveObjects().filter(isShapeElement);
      if (!targets.length) return;
      targets.forEach(obj => applyShapeStyle(obj, style));
      canvas.requestRenderAll();
      notifyObjectsUpdate();
      handleSelectionRef.current?.();
      clearTimeout(styleHistoryTimerRef.current);
      styleHistoryTimerRef.current = setTimeout(() => pushHistory(), 400);
    },

    batchUpdateProperties: (newProps) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObjects = canvas.getActiveObjects();

      activeObjects.forEach(obj => {
        if (obj.isBooth) {
          updateBoothAppearance(obj, newProps);
        }
      });
      canvas.requestRenderAll();
      notifyObjectsUpdate();
      handleSelectionRef.current?.();
      pushHistory();
    },

    // Delete selected
    deleteSelected: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObjects = canvas.getActiveObjects();
      if (activeObjects.length) {
        canvas.discardActiveObject();
        activeObjects.forEach(obj => {
          if (!obj.isBackgroundBlueprint) {
            canvas.remove(obj);
          }
        });
        refreshPillarConflicts();
        canvas.requestRenderAll();
        notifyObjectsUpdate();
        onSelectionChange(null, []);
        pushHistory();
      }
    },

    // Duplicate selected (one or several objects): exact copies 1 m to the right and down, relative positions kept
    duplicateSelected: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const members = canvas.getActiveObjects().filter(o => !o.isBackgroundBlueprint);
      if (!members.length) return;
      const step = gridScaleRef.current;
      addCopies(members.map(o => serializeForCopy(canvas, o)), { dx: step, dy: step, anchors: members, placement: 'above' });
    },

    // Group / Ungroup
    groupSelected: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active || (active.type || '').toLowerCase() !== 'activeselection') return;

      const objects = active.getObjects();
      canvas.discardActiveObject();
      const group = new fabric.Group(objects, {
        cornerColor: '#2563eb',
        cornerSize: 8,
        transparentCorners: false,
        strokeUniform: true,
        noScaleCache: true,
        objectCaching: false
      });
      group.isCustomGroup = true;
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
      notifyObjectsUpdate();
      pushHistory();
    },

    ungroupSelected: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;

      const activeType = (active.type || '').toLowerCase();

      if (activeType === 'group') {
        canvas.discardActiveObject();
        // In Fabric 7, removeAll returns children transformed to global coordinates
        const items = typeof active.removeAll === 'function'
          ? active.removeAll()
          : (active.getObjects ? [...active.getObjects()] : []);

        canvas.remove(active);
        items.forEach(item => {
          canvas.add(item);
          item.setCoords();
        });

        if (items.length > 0) {
          const selection = new fabric.ActiveSelection(items, { canvas });
          canvas.setActiveObject(selection);
        }
        canvas.requestRenderAll();
        notifyObjectsUpdate();
        pushHistory();
      } else if (activeType === 'activeselection') {
        const objects = active.getObjects();
        const groups = objects.filter(o => (o.type || '').toLowerCase() === 'group' && (o.isCustomGroup || !o.isBooth));
        if (groups.length > 0) {
          canvas.discardActiveObject();
          const allNewItems = [];
          groups.forEach(grp => {
            const items = typeof grp.removeAll === 'function' ? grp.removeAll() : [...grp.getObjects()];
            canvas.remove(grp);
            items.forEach(item => {
              canvas.add(item);
              item.setCoords();
              allNewItems.push(item);
            });
          });
          if (allNewItems.length > 0) {
            const selection = new fabric.ActiveSelection(allNewItems, { canvas });
            canvas.setActiveObject(selection);
          }
          canvas.requestRenderAll();
          notifyObjectsUpdate();
          pushHistory();
        }
      }
    },

    mergeSelectedBooths: () => {
      const canvas = fabricRef.current;
      if (!canvas) return { success: false, error: 'Canvas belum diinisialisasi' };

      const active = canvas.getActiveObject();
      const activeObjects = canvas.getActiveObjects();

      if (!active || !activeObjects || activeObjects.length < 2) {
        return { success: false, error: 'Pilih minimal 2 booth di denah terlebih dahulu' };
      }

      // Filter only booth objects
      const booths = activeObjects.filter(item => item && item.isBooth && item.boothData);
      
      if (booths.length < 2) {
        return { success: false, error: 'Pilih minimal 2 booth untuk digabungkan (Merge).' };
      }

      // Cleanly discard the active selection so every booth is placed directly on the canvas
      // with its final absolute coordinates (left, top) without relative transform matrix confusion
      canvas.discardActiveObject();

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let totalArea = 0;

      booths.forEach(b => {
        const w = Math.round(b.width * (b.scaleX || 1));
        const h = Math.round(b.height * (b.scaleY || 1));
        const l = Math.round(b.left);
        const t = Math.round(b.top);
        const r = l + w;
        const bot = t + h;

        if (l < minX) minX = l;
        if (t < minY) minY = t;
        if (r > maxX) maxX = r;
        if (bot > maxY) maxY = bot;

        totalArea += (w * h);
      });

      const mergedWidth = maxX - minX;
      const mergedHeight = maxY - minY;
      const bboxArea = mergedWidth * mergedHeight;
      const gridScale = gridScaleRef.current || DEFAULT_GRID_SCALE;

      // Check if they form a rectangular contiguous area (allow up to 6% tolerance for borders/padding)
      const areaDiff = Math.abs(bboxArea - totalArea);
      if (areaDiff > Math.max(30, totalArea * 0.06)) {
        // Re-select booths so user keeps their selection
        const sel = new fabric.ActiveSelection(booths, { canvas });
        canvas.setActiveObject(sel);
        canvas.requestRenderAll();
        return { 
          success: false, 
          error: 'Booth yang dipilih harus saling menempel rapat (bersebelahan) dan membentuk area persegi atau persegi panjang sempurna.' 
        };
      }

      const mergedWidthM = parseFloat((mergedWidth / gridScale).toFixed(1));
      const mergedHeightM = parseFloat((mergedHeight / gridScale).toFixed(1));

      // Determine combined code
      const codes = booths.map(b => b.boothData?.code).filter(Boolean);
      const mergedCode = codes.join('+').length <= 16 ? codes.join('+') : `${codes[0]}+${codes.length - 1}`;

      // Smart category resolution based on dimensions
      let mergedCategory = 'Standard';
      if (mergedWidthM >= 6 && mergedHeightM >= 6) {
        mergedCategory = 'Island';
      } else if (mergedWidthM >= 5.5 || mergedHeightM >= 5.5) {
        mergedCategory = 'Premium';
      } else if (booths.some(b => b.boothData?.category === 'Corner')) {
        mergedCategory = 'Corner';
      }

      // Sum of prices
      const mergedPrice = booths.reduce((acc, b) => acc + (Number(b.boothData?.price) || 0), 0);

      // Preserve tenant & status if any booth was sold/reserved
      const soldBooth = booths.find(b => (b.boothData?.status || '').toLowerCase() === 'sold');
      const reservedBooth = booths.find(b => (b.boothData?.status || '').toLowerCase() === 'reserved');
      const activeTenantBooth = soldBooth || reservedBooth || booths.find(b => b.boothData?.ownerName?.trim());

      const mergedStatus = soldBooth ? 'sold' : (reservedBooth ? 'reserved' : 'available');
      const mergedOwnerName = activeTenantBooth?.boothData?.ownerName || '';
      const mergedBrandCategory = activeTenantBooth?.boothData?.brandCategory || '';

      // Collect unique facilities
      const allFacilities = new Set();
      booths.forEach(b => {
        if (Array.isArray(b.boothData?.facilities)) {
          b.boothData.facilities.forEach(f => allFacilities.add(f));
        }
      });
      if (allFacilities.size === 0) {
        ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL'].forEach(f => allFacilities.add(f));
      }

      // Create new merged booth object
      const newBooth = createBoothObject({
        code: mergedCode,
        category: mergedCategory,
        status: mergedStatus,
        price: mergedPrice,
        ownerName: mergedOwnerName,
        widthM: mergedWidthM,
        heightM: mergedHeightM,
        left: minX,
        top: minY,
        gridScale,
        facilities: Array.from(allFacilities)
      });

      if (mergedBrandCategory) {
        newBooth.boothData.brandCategory = mergedBrandCategory;
      }

      // Remove the old individual booths from canvas
      booths.forEach(b => canvas.remove(b));

      // Add the new merged booth
      canvas.add(newBooth);
      canvas.setActiveObject(newBooth);
      canvas.requestRenderAll();

      notifyObjectsUpdate();
      pushHistory();
      handleSelectionRef.current?.();

      return { 
        success: true, 
        mergedCode, 
        dimensions: `${mergedWidthM}x${mergedHeightM}m` 
      };
    },

    // Undo / Redo
    undo: () => {
      if (historyIndexRef.current > 0) {
        historyIndexRef.current -= 1;
        loadHistoryState(historyStackRef.current[historyIndexRef.current]);
        onHistoryChange?.({
          canUndo: historyIndexRef.current > 0,
          canRedo: true
        });
      }
    },
    redo: () => {
      if (historyIndexRef.current < historyStackRef.current.length - 1) {
        historyIndexRef.current += 1;
        loadHistoryState(historyStackRef.current[historyIndexRef.current]);
        onHistoryChange?.({
          canUndo: true,
          canRedo: historyIndexRef.current < historyStackRef.current.length - 1
        });
      }
    },

    // Layer orders
    bringForward: () => {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (active) {
        canvas.bringObjectForward(active);
        canvas.requestRenderAll();
        pushHistory();
      }
    },
    sendBackward: () => {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (active) {
        canvas.sendObjectBackwards(active);
        if (blueprintObjRef.current) {
          canvas.sendObjectToBack(blueprintObjRef.current);
        }
        canvas.requestRenderAll();
        pushHistory();
      }
    },

    // Zoom controls
    setZoomLevel: (zoom) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const point = new fabric.Point(canvas.width / 2, canvas.height / 2);
      canvas.zoomToPoint(point, zoom);
      onZoomChange?.(zoom);
      setViewportTransform([...canvas.viewportTransform]);
      canvas.requestRenderAll();
    },
    resetZoom: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      onZoomChange?.(1);
      setViewportTransform([1, 0, 0, 1, 0, 0]);
      canvas.requestRenderAll();
    },
    fitToScreen: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const objects = canvas.getObjects().filter(o => !o.isGridLine && !o.isBackgroundBlueprint);
      if (objects.length === 0) {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        onZoomChange?.(1);
        setViewportTransform([1, 0, 0, 1, 0, 0]);
        canvas.requestRenderAll();
        return;
      }

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
      const fitZoom = Math.min(Math.min(zoomX, zoomY), 1.5);

      const vpt = canvas.viewportTransform;
      vpt[0] = fitZoom;
      vpt[3] = fitZoom;
      vpt[4] = (canvas.width - width * fitZoom) / 2 - minX * fitZoom;
      vpt[5] = (canvas.height - height * fitZoom) / 2 - minY * fitZoom;

      canvas.setViewportTransform(vpt);
      onZoomChange?.(fitZoom);
      setViewportTransform([...vpt]);
      canvas.requestRenderAll();
    },

    // Export formats
    exportSvg: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const svg = canvas.toSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `floorplan-vector-${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    },
    exportPng: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `floorplan-render-${Date.now()}.png`;
      a.click();
    },
    getPngDataUrl: (multiplier = 2) => {
      const canvas = fabricRef.current;
      if (!canvas) return null;
      return canvas.toDataURL({ format: 'png', multiplier });
    },
    exportPdf: async (metadata = {}, options = {}) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const boothObjs = canvas.getObjects().filter(o => o.isBooth && o.boothData);
      const booths = boothObjs.map(o => o.boothData);
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2.5 });
      return await exportFloorplanToPdf(dataUrl, {
        ...metadata,
        booths: metadata.booths || booths
      }, options);
    },

    // Clear all
    clearAll: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.getObjects().forEach(obj => {
        if (!obj.isBackgroundBlueprint) {
          canvas.remove(obj);
        }
      });
      canvas.requestRenderAll();
      notifyObjectsUpdate();
      onSelectionChange(null, []);
      pushHistory();
    },

    selectObject: (targetObj) => {
      const canvas = fabricRef.current;
      if (!canvas || !targetObj) return;
      canvas.setActiveObject(targetObj);
      canvas.requestRenderAll();
      handleSelectionRef.current?.();
    }
  }));

  const pillarConflictsRef = useRef(new Set());
  const refreshPillarConflicts = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const conflicts = findPillarConflicts(canvas);
    const newly = [];
    canvas.getObjects().forEach(o => {
      if (!o.isBooth || !o.boothData) return;
      const hit = conflicts.has(o);
      if (hit && !o.boothData.pillarConflict) newly.push(o.boothData.code);
      // Kept with the booth (saved in the canvas JSON): "Ada pilar di area booth"
      o.boothData.pillarConflict = hit;
      if (hit) o.boothData.pillarNote = 'Ada pilar di area booth';
      else delete o.boothData.pillarNote;
    });
    pillarConflictsRef.current = conflicts;
    if (newly.length) onWarning?.(`⚠️ Booth ${newly.join(', ')} menabrak pilar — ditandai "Ada pilar di area booth" (tetap bisa disimpan).`);
    canvas.requestRenderAll();
  }, [onWarning]);

  const notifyObjectsUpdate = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Read-only operational overlay objects (sales Studio) are not part of this floorplan's object list
    const userObjects = canvas.getObjects().filter(o => !o.isGridLine && !o.isBackgroundBlueprint && !o.isOpsOverlay);
    onObjectsUpdate?.(userObjects);
  }, [onObjectsUpdate]);

  // Copies (Duplikasi, Ctrl/Cmd + drag, Ctrl/Cmd + V): the originals' full serialized form, deep-copied, with a new
  // identity and an offset (copyRules.js). `raws` are absolute-coordinate objects (canvas._toObject), `anchors`
  // the originals: each copy goes right above its original ('above') or right below it ('below').
  const addCopies = async (raws, { dx = 0, dy = 0, anchors = [], placement = 'above', select = true } = {}) => {
    const canvas = fabricRef.current;
    if (!canvas || !raws.length) return [];
    const ctx = {
      usedCodes: new Set(canvas.getObjects().filter(o => o.isBooth).map(o => o.boothData?.code).filter(Boolean)),
      allowBooths: layerModeRef.current !== 'ops',
      opsLayer: layerModeRef.current === 'ops'
    };
    const pairs = raws.map((raw, i) => ({ data: prepareCopy(raw, { ...ctx, dx, dy }), anchor: anchors[i] })).filter(p => p.data);
    if (!pairs.length) return [];
    const objs = await fabric.util.enlivenObjects(pairs.map(p => p.data));
    objs.forEach((obj, i) => {
      hydrateBoothObject(obj, pairs[i].data, []);
      const anchorIndex = pairs[i].anchor ? canvas.getObjects().indexOf(pairs[i].anchor) : -1;
      if (anchorIndex >= 0) canvas.insertAt(placement === 'below' ? anchorIndex : anchorIndex + 1, obj);
      else canvas.add(obj);
      // new code, empty tenant: redraw the booth's labels (size, category, corners are kept)
      if (obj.isBooth) updateBoothAppearance(obj, {});
      obj.setCoords();
    });
    if (select) {
      canvas.discardActiveObject();
      canvas.setActiveObject(objs.length > 1 ? new fabric.ActiveSelection(objs, { canvas }) : objs[0]);
    }
    canvas.requestRenderAll();
    refreshPillarConflicts();
    notifyObjectsUpdate();
    handleSelectionRef.current?.();
    pushHistory();
    return objs;
  };
  addCopiesRef.current = addCopies;
  // Absolute serialized form of an object, also when it is part of a multi-selection. A booth under the pointer
  // carries the hover glow: its copy gets the resting shadow.
  const serializeForCopy = (canvas, obj) => {
    const raw = canvas._toObject(obj, 'toObject', COPY_PROPS);
    if (raw.isBooth && raw.shadow?.color === BOOTH_HOVER_SHADOW.color) raw.shadow = { ...raw.shadow, ...BOOTH_REST_SHADOW };
    return raw;
  };

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !fabricRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      fabricRef.current.setDimensions({ width, height });
      setContainerDimensions({ width, height });
      fabricRef.current.requestRenderAll();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize Canvas
  useEffect(() => {
    if (!canvasElRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 900;
    const height = containerRef.current.clientHeight || 650;
    setContainerDimensions({ width, height });

    // CRITICAL: backgroundColor 'transparent' so CSS grid is always visible underneath!
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width,
      height,
      backgroundColor: 'transparent',
      selection: true,
      preserveObjectStacking: true,
      fireRightClick: true,
      stopContextMenu: true
    });

    fabricRef.current = canvas;

    // Pan & Zoom with Wheel
    canvas.on('mouse:wheel', (opt) => {
      const delta = opt.e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      if (zoom > 5) zoom = 5;
      if (zoom < 0.2) zoom = 0.2;

      const point = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
      canvas.zoomToPoint(point, zoom);
      opt.e.preventDefault();
      opt.e.stopPropagation();
      onZoomChange?.(zoom);
      setViewportTransform([...canvas.viewportTransform]);
    });

    // Pan / Dragging canvas & Ctrl+Drag duplication tracking
    let isDragging = false;
    let lastPosX = 0;
    let lastPosY = 0;

    // Mouse Over & Mouse Out for Booth Hover Card & Glow
    canvas.on('mouse:over', (opt) => {
      const target = opt.target;
      if (target && (target.isBooth || target.boothData)) {
        if (isPreviewModeRef.current) {
          setHoveredBooth(target.boothData);
        }
        target.set({ shadow: new fabric.Shadow(BOOTH_HOVER_SHADOW) });
        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:out', (opt) => {
      const target = opt.target;
      if (target && (target.isBooth || target.boothData)) {
        setHoveredBooth(null);
        target.set({ shadow: new fabric.Shadow(BOOTH_REST_SHADOW) });
        canvas.requestRenderAll();
      }
    });

    // Abort any transform in preview mode
    canvas.on('before:transform', () => {
      if (isPreviewModeRef.current && canvas._currentTransform) {
        canvas._currentTransform = null;
      }
    });

    canvas.on('mouse:down:before', (opt) => {
      if (isPreviewModeRef.current) {
        canvas.discardActiveObject();
        canvas._activeObject = undefined;
        if (canvas._currentTransform) {
          canvas._currentTransform = null;
        }
        if (opt?.target) {
          opt.target.selectable = false;
          opt.target.hasBorders = false;
          opt.target.hasControls = false;
          opt.target.activeOn = 'none';
          opt.target.drawBorders = function() {};
          opt.target.drawControls = function() {};
          opt.target._renderControls = function() {};
        }
      }
    });

    canvas.on('mouse:down', (opt) => {
      const evt = opt.e;
      const target = opt.target;

      // In Preview Mode, clicking a booth opens booking simulation, dragging pans viewport
      if (isPreviewModeRef.current) {
        canvas.discardActiveObject();
        canvas._activeObject = undefined;
        if (canvas._currentTransform) {
          canvas._currentTransform = null;
        }
        if (opt?.target) {
          opt.target.selectable = false;
          opt.target.hasBorders = false;
          opt.target.hasControls = false;
          opt.target.activeOn = 'none';
          opt.target.drawBorders = function() {};
          opt.target.drawControls = function() {};
          opt.target._renderControls = function() {};
        }

        const boothObj = (target?.isBooth || target?.boothData) 
          ? target 
          : (target?.group?.isBooth || target?.group?.boothData) 
          ? target.group 
          : null;

        if (boothObj && (boothObj.isBooth || boothObj.boothData)) {
          if (onBoothActionRef.current) {
            const pt = evt?.touches?.[0] || evt?.changedTouches?.[0] || evt || {};
            // where the booth is on the screen, so the pop up opens beside it instead of on top of it
            const el = canvas.upperCanvasEl?.getBoundingClientRect() || { left: 0, top: 0 };
            const pts = boothObj.getCoords().map(c => fabric.util.transformPoint(c, canvas.viewportTransform));
            const xs = pts.map(c => c.x + el.left);
            const ys = pts.map(c => c.y + el.top);
            onBoothActionRef.current(boothObj.boothData, {
              x: pt.clientX ?? 0, y: pt.clientY ?? 0,
              rect: { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
            });
          } else {
            onOpenBookingForBooth?.(boothObj.boothData);
          }
          return;
        }

        isDragging = true;
        canvas.selection = false;
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
        return;
      }

      if (target && !target.isBackgroundBlueprint) {
        target._dragStartX = target.left;
        target._dragStartY = target.top;
        target._hasClonedInDrag = false;
      }

      if (isSpacePressedRef.current || isPanModeRef.current || evt.button === 1) {
        isDragging = true;
        canvas.selection = false;
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
      }
    });

    canvas.on('mouse:move', (opt) => {
      if (opt.scenePoint) lastPointerRef.current = { x: opt.scenePoint.x, y: opt.scenePoint.y, at: Date.now() };
      const e = opt.e;
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }

      // Full caption on hover when it is shortened with "…" or hidden (zoomed out / no room)
      if (!isDragging && !(e.buttons > 0)) {
        const vp = opt.viewportPoint || canvas.getViewportPoint(e);
        const hit = showCaptionsRef.current ? findCaptionHit(captionHitsRef.current, vp.x, vp.y) : null;
        const text = hit && (hit.truncated || !hit.drawn) ? hit.text : null;
        setCaptionTip(prev => {
          if (!text) return prev ? null : prev;
          if (prev && prev.text === text && Math.abs(prev.x - vp.x) < 4 && Math.abs(prev.y - vp.y) < 4) return prev;
          return { text, x: vp.x, y: vp.y };
        });
      } else {
        setCaptionTip(prev => (prev ? null : prev));
      }

      if (isDragging) {
        const vpt = canvas.viewportTransform;
        vpt[4] += e.clientX - lastPosX;
        vpt[5] += e.clientY - lastPosY;
        canvas.requestRenderAll();
        lastPosX = e.clientX;
        lastPosY = e.clientY;
        setViewportTransform([...vpt]);
      }
    });

    // pointer left the canvas (not just an object): paste falls back to "1 m further"
    canvas.on('mouse:out', (opt) => { if (!opt?.target) lastPointerRef.current = null; });

    canvas.on('mouse:up', () => {
      setShapeResizeBadge(null);
      elementSnapCacheRef.current = null;
      if (snapGuidesRef.current) {
        snapGuidesRef.current = null;
        canvas.requestRenderAll();
      }
      if (isDragging) {
        canvas.setViewportTransform(canvas.viewportTransform);
        isDragging = false;
        canvas.selection = !isPanModeRef.current && !isPreviewModeRef.current;
        setViewportTransform([...canvas.viewportTransform]);
      }
      if (isPreviewModeRef.current) {
        canvas.discardActiveObject();
        canvas._activeObject = undefined;
        if (canvas._currentTransform) {
          canvas._currentTransform = null;
        }
        canvas.requestRenderAll();
      }
    });

    // Handle Object Moving: Snap to Grid + Ctrl/Alt+Drag to Duplicate!
    canvas.on('object:moving', (opt) => {
      if (isPreviewModeRef.current) {
        const target = opt.target;
        if (target) {
          target.left = target._dragStartX ?? target.left;
          target.top = target._dragStartY ?? target.top;
          target.setCoords();
        }
        if (canvas._currentTransform) {
          canvas._currentTransform = null;
        }
        canvas.requestRenderAll();
        return;
      }

      const target = opt.target;
      const evt = opt.e;

      // 1. Shortcut: Ctrl / Cmd + Drag clones object (Alt / Option is "move without snapping")
      if (evt && (evt.ctrlKey || evt.metaKey) && !target._hasClonedInDrag && !target.isBackgroundBlueprint) {
        target._hasClonedInDrag = true;
        // The dragged objects are the originals; exact copies stay behind at the start position, right below them
        const dx = (target._dragStartX ?? target.left) - target.left;
        const dy = (target._dragStartY ?? target.top) - target.top;
        const members = target.type?.toLowerCase() === 'activeselection' ? target.getObjects() : [target];
        addCopiesRef.current?.(members.map(o => serializeForCopy(canvas, o)), { dx, dy, anchors: members, placement: 'below', select: false });
      }

      // Alt / Option held: move freely (no grid, no booth snapping)
      const freeMove = Boolean(evt?.altKey);
      const rawPos = { left: target.left, top: target.top };

      // 2. Snap to Grid (1 kotak = 1 meter = gridScale)
      if (snapToGridRef.current && !freeMove) {
        const grid = gridScaleRef.current;
        const w = target.width * (target.scaleX || 1);
        const h = target.height * (target.scaleY || 1);
        
        target.set({
          left: snapCoords(target.left, grid, target.originX, w),
          top: snapCoords(target.top, grid, target.originY, h)
        });
      }

      // 2a. Snap ke Booth: edges / corners of other booths win over the grid; each axis falls back to the grid
      if (snapToBoothsRef.current && !freeMove && containsBooth(target)) {
        const gridPos = { left: target.left, top: target.top };
        target.set(rawPos);
        target.setCoords();
        const targets = snapTargets(canvas, target, { includeWalls: snapToWallsRef.current });
        const { dx, dy } = computeSnap(boxOf(target), targets, SNAP_SCREEN_PX / (canvas.getZoom() || 1));
        target.set({
          left: dx !== null ? rawPos.left + dx : gridPos.left,
          top: dy !== null ? rawPos.top + dy : gridPos.top
        });
        target.setCoords();
        snapGuidesRef.current = computeGuides(boxOf(target), targets, { gridScale: gridScaleRef.current });
      } else if (elementSnapOn() && !freeMove && !containsBooth(target)) {
        // 2a'. Snap ke Elemen / ke Booth for elements (same snap rules, booths are anchors only):
        //      line ends to ends / corners, else sides & corners, else centre / equal spacing, else the grid
        const gridPos = { left: target.left, top: target.top };
        target.set(rawPos);
        target.setCoords();
        const targets = elementTargetsFor(canvas, target);
        const thr = SNAP_SCREEN_PX / (canvas.getZoom() || 1);
        const geo = movingGeometry(target);
        const endSnap = geo.ends ? snapLineEnds(geo.ends, targets, thr) : null;
        const { dx, dy } = endSnap || computeSnap(geo.box, targets, thr, { elements: true, center: geo.center });
        target.set({
          left: dx !== null ? rawPos.left + dx : gridPos.left,
          top: dy !== null ? rawPos.top + dy : gridPos.top
        });
        target.setCoords();
        const after = movingGeometry(target);
        snapGuidesRef.current = computeGuides(after.box, targets, { gridScale: gridScaleRef.current, elements: true, center: after.center, point: endSnap?.point || null });
      } else {
        snapGuidesRef.current = null;
      }

      // 2b. Doors stick to a nearby wall and take its angle; gates & turnstiles stick to walls and doors
      if (target?.venueData?.type === 'door') {
        snapDoorToWall(target, canvas, gridScaleRef.current);
      } else if (isLibraryElement(target) && ELEMENTS[target.venueData.type].snapToWall) {
        snapGateToWallOrDoor(target, canvas, gridScaleRef.current);
      }

      // 3. Update Dimension Guide
      if (showDimensionsRef.current && target) {
        const vpt = canvas.viewportTransform;
        const screenX = target.left * vpt[0] + vpt[4];
        const screenY = (target.top - 15) * vpt[3] + vpt[5];
        const wM = (target.width * (target.scaleX || 1)) / gridScaleRef.current;
        const hM = (target.height * (target.scaleY || 1)) / gridScaleRef.current;
        const xM = target.left / gridScaleRef.current;
        const yM = target.top / gridScaleRef.current;
        setActiveDimension({
          wM: wM.toFixed(1),
          hM: hM.toFixed(1),
          xM: xM.toFixed(1),
          yM: yM.toFixed(1),
          screenX,
          screenY
        });
      }
    });

    // Remember where a booth resize starts: the dragged side is the one that moves
    canvas.on('before:transform', (opt) => {
      const target = opt?.transform?.target;
      if (target?.isBooth) target.__transformStartBox = boxOf(target);
    });

    // Text Box & Bentuk resize: the dragged side sticks to the nearest booth / element side
    // (straight elements only; Alt = from the centre and Shift = keep proportion are never snapped)
    canvas.__snapShapeResize = (target, transform, { w, h, axis }) => {
      const angle = ((Math.round(target.angle || 0) % 360) + 360) % 360;
      if (!elementSnapOn() || angle !== 0) return null;
      const targets = elementTargetsFor(canvas, target);
      if (!targets.length) return null;
      const anchor = target.getPositionByOrigin(transform.originX, transform.originY);
      const thr = SNAP_SCREEN_PX / (canvas.getZoom() || 1);
      const nearest = (value, edges) => edges.reduce((best, e) => (Math.abs(e - value) <= thr && (best === null || Math.abs(e - value) < Math.abs(best - value)) ? e : best), null);
      const next = { w, h };
      if (axis !== 'y' && (transform.originX === 'left' || transform.originX === 'right')) {
        const dir = transform.originX === 'left' ? 1 : -1;
        const edge = nearest(anchor.x + dir * w, targets.flatMap(t => [t.box.l, t.box.r]));
        if (edge !== null && (edge - anchor.x) * dir > 0) next.w = Math.abs(edge - anchor.x);
      }
      if (axis !== 'x' && (transform.originY === 'top' || transform.originY === 'bottom')) {
        const dir = transform.originY === 'top' ? 1 : -1;
        const edge = nearest(anchor.y + dir * h, targets.flatMap(t => [t.box.t, t.box.b]));
        if (edge !== null && (edge - anchor.y) * dir > 0) next.h = Math.abs(edge - anchor.y);
      }
      return next;
    };

    // Queue line vertices being dragged stick to corners, line ends and centres (Alt = free)
    canvas.__snapPoint = (pt, target, eventData) => {
      if (!elementSnapOn() || eventData?.altKey) return null;
      const point = snapPoint(pt, elementTargetsFor(canvas, target), SNAP_SCREEN_PX / (canvas.getZoom() || 1));
      snapGuidesRef.current = point ? { lines: [{ x1: point.x, y1: point.y, x2: point.x, y2: point.y, kind: 'touch' }], distance: null } : null;
      return point;
    };

    // Object Scaling: Live dimension updates
    canvas.on('object:scaling', (opt) => {
      const target = opt.target;
      if (isShapeElement(target)) {
        const gs = gridScaleRef.current;
        const fmt = (px) => (Math.round((px / gs) * 100) / 100).toString().replace('.', ',');
        const top = target.oCoords?.mt || target.oCoords?.tl;
        if (top) setShapeResizeBadge({ text: `${fmt(target.width)} × ${fmt(target.boxHeight || target.height)} m`, x: top.x, y: top.y });
      }
      // Snap ke Booth while resizing: the dragged side sticks to the nearest booth side (0 / 90 / 180 / 270 deg)
      const angle = ((Math.round(target?.angle || 0) % 360) + 360) % 360;
      if (target?.isBooth && target.__transformStartBox && snapToBoothsRef.current && !opt.e?.altKey && angle % 90 === 0) {
        const start = target.__transformStartBox;
        const cur = boxOf(target);
        const targets = snapTargets(canvas, target, { includeWalls: snapToWallsRef.current });
        const thr = SNAP_SCREEN_PX / (canvas.getZoom() || 1);
        const nearestEdge = (value, axis) => {
          let best = null;
          targets.forEach(({ box }) => (axis === 'x' ? [box.l, box.r] : [box.t, box.b]).forEach(edge => {
            if (Math.abs(edge - value) <= thr && (best === null || Math.abs(edge - value) < Math.abs(best - value))) best = edge;
          }));
          return best;
        };
        const moved = (k) => Math.abs(cur[k] - start[k]) > 0.01;
        const next = { ...cur };
        if (moved('r') && !moved('l')) next.r = nearestEdge(cur.r, 'x') ?? cur.r;
        if (moved('l') && !moved('r')) next.l = nearestEdge(cur.l, 'x') ?? cur.l;
        if (moved('b') && !moved('t')) next.b = nearestEdge(cur.b, 'y') ?? cur.b;
        if (moved('t') && !moved('b')) next.t = nearestEdge(cur.t, 'y') ?? cur.t;
        if (['l', 'r', 't', 'b'].some(k => next[k] !== cur[k]) && next.r > next.l && next.b > next.t) {
          const swap = angle % 180 === 90;
          const w = next.r - next.l;
          const h = next.b - next.t;
          target.set({ scaleX: (swap ? h : w) / (target.width || 1), scaleY: (swap ? w : h) / (target.height || 1) });
          target.setPositionByOrigin(new fabric.Point((next.l + next.r) / 2, (next.t + next.b) / 2), 'center', 'center');
          target.setCoords();
        }
        snapGuidesRef.current = computeGuides(boxOf(target), targets, { gridScale: gridScaleRef.current });
      }
      if (showDimensionsRef.current && target) {
        const vpt = canvas.viewportTransform;
        const screenX = target.left * vpt[0] + vpt[4];
        const screenY = (target.top - 15) * vpt[3] + vpt[5];
        const wM = (target.width * (target.scaleX || 1)) / gridScaleRef.current;
        const hM = (target.height * (target.scaleY || 1)) / gridScaleRef.current;
        const xM = target.left / gridScaleRef.current;
        const yM = target.top / gridScaleRef.current;
        setActiveDimension({
          wM: wM.toFixed(1),
          hM: hM.toFixed(1),
          xM: xM.toFixed(1),
          yM: yM.toFixed(1),
          screenX,
          screenY
        });
      }
    });

    // Object Modified: Normalize scale factors & keep text neatly inside boundaries!
    canvas.on('object:modified', (opt) => {
      const target = opt.target;
      // A rotated booth: the tenant name's direction is decided again from what is seen on the screen
      if ((opt.action || opt.transform?.action) === 'rotate' && target) {
        const rotated = target.isBooth ? [target] : (target.getObjects?.() || []).filter(o => o.isBooth);
        rotated.forEach(b => updateBoothAppearance(b, {}));
      }
      // A rebuilt element replaces the one Fabric is still finishing a transform on: selecting it right away
      // would end that transform again (object:modified -> rebuild -> ... thousands of copies, stack overflow)
      const selectAfterTransform = (obj) => setTimeout(() => {
        if (!obj.canvas) return;
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
        handleSelection();
      }, 0);
      if (isShapeElement(target)) {
        // Text Box & Bentuk resize without scaling: store the new size in metres (and the text) on the element
        syncShapeElement(target);
        setShapeResizeBadge(null);
      } else if (isLibraryElement(target)) {
        const def = ELEMENTS[target.venueData.type];
        const sx = Math.abs(target.scaleX || 1);
        const sy = Math.abs(target.scaleY || 1);
        let current = target;
        if (def.kind === 'queue') {
          if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) current = rebuildLibraryElement(canvas, current, {});
          current = connectQueueEnds(current, canvas, gridScaleRef.current) || current;
        } else if (def.kind === 'text') {
          if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
            const fontSize = Math.max(6, Math.round((Number(current.venueData.props?.fontSize) || 16) * Math.max(sx, sy)));
            current = rebuildLibraryElement(canvas, current, { props: { fontSize } });
          }
        } else if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
          current = rebuildLibraryElement(canvas, current, {
            widthM: Math.round(current.venueData.widthM * sx * 100) / 100,
            heightM: def.kind === 'measure' ? current.venueData.heightM : Math.round(current.venueData.heightM * sy * 100) / 100
          });
        }
        if (current !== target) selectAfterTransform(current);
      } else if (target?.venueData?.type === 'door') {
        // Stretching a door with its side handles changes its width; redraw it crisply at scale 1
        if (Math.abs((target.scaleX || 1) - 1) > 0.001 || Math.abs((target.scaleY || 1) - 1) > 0.001) {
          const widthM = (target.venueData.widthM || 0.9) * Math.abs(target.scaleX || 1);
          selectAfterTransform(rebuildDoorObject(canvas, target, { widthM }));
        }
      } else if (target && !target.isBackgroundBlueprint) {
        normalizeScaledObject(target, gridScale);
      }

      // Booths: neat 0,01 m positions (no tiny gaps from decimals) and a warning when they end up overlapping
      snapGuidesRef.current = null;
      elementSnapCacheRef.current = null;
      if (target && !containsBooth(target) && opt.action === 'drag' && !target.isBackgroundBlueprint) {
        // Elements: the same 0,01 m position step; overlapping booths or other elements is allowed
        target.set({ left: roundToStep(target.left, gridScaleRef.current), top: roundToStep(target.top, gridScaleRef.current) });
        target.setCoords();
      }
      if (target && containsBooth(target)) {
        delete target.__transformStartBox;
        target.set({ left: roundToStep(target.left, gridScaleRef.current), top: roundToStep(target.top, gridScaleRef.current) });
        target.setCoords();
        if (snapToBoothsRef.current) {
          const moved = new Set((target.type || '').toLowerCase() === 'activeselection' ? target.getObjects() : [target]);
          const overlaps = findBoothOverlaps(canvas).filter(o => moved.has(o.a) || moved.has(o.b));
          if (overlaps.length) {
            const names = [...new Set(overlaps.map(o => `${o.a.boothData?.code || '?'} & ${o.b.boothData?.code || '?'}`))];
            onWarningRef.current?.(`⚠️ Booth tumpang tindih: ${names.join(', ')}. Area yang bertumpuk ditandai merah, geser booth agar tidak menimpa.`);
          }
        }
      }
      refreshPillarConflicts();
      handleSelection();
      notifyObjectsUpdate();
      pushHistory();
    });

    // Text labels: keep the edited text as the element's label
    canvas.on('text:editing:exited', (opt) => {
      const target = opt.target;
      if (isLibraryElement(target)) {
        target.venueData.label = target.text;
        notifyObjectsUpdate();
        handleSelection();
        pushHistory();
      }
    });

    // Read-only Studio: outline the booth whose action pop up is open (never painted into exports)
    canvas.on('after:render', ({ ctx }) => {
      const code = highlightBoothCodeRef.current;
      if (!code || (ctx && ctx !== canvas.contextContainer)) return;
      const target = canvas.getObjects().find(o => o.boothData && (o.boothData.code || o.boothData.booth_number) === code);
      if (!target) return;
      const context = ctx || canvas.getContext();
      const vpt = canvas.viewportTransform;
      const pts = target.getCoords().map(p => fabric.util.transformPoint(p, vpt));
      context.save();
      context.strokeStyle = '#4f46e5';
      context.lineWidth = 3;
      context.shadowColor = 'rgba(79, 70, 229, 0.55)';
      context.shadowBlur = 12;
      context.beginPath();
      pts.forEach((p, i) => (i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)));
      context.closePath();
      context.stroke();
      context.restore();
    });

    // Outline booths that overlap a pillar
    canvas.on('after:render', ({ ctx }) => {
      const conflicts = pillarConflictsRef.current;
      if (!conflicts || !conflicts.size || isPreviewModeRef.current) return;
      const context = ctx || canvas.getContext();
      const vpt = canvas.viewportTransform;
      context.save();
      context.setLineDash([6, 4]);
      context.strokeStyle = '#e11d48';
      context.lineWidth = 2;
      conflicts.forEach(o => {
        if (!o.canvas) return;
        const pts = o.getCoords().map(p => fabric.util.transformPoint(p, vpt));
        context.beginPath();
        pts.forEach((p, i) => (i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)));
        context.closePath();
        context.stroke();
      });
      context.restore();
    });

    // Snap guides (pink = touching side / corner, dashed = aligned with a booth further away, distance in metres)
    // and red marks on overlapping booths. Editor-only: never painted into exports.
    canvas.on('after:render', ({ ctx }) => {
      if (!(snapToBoothsRef.current || snapToElementsRef.current) || isPreviewModeRef.current || (ctx && ctx !== canvas.contextContainer)) return;
      const context = ctx || canvas.getContext();
      const vpt = canvas.viewportTransform;
      const toScreen = (x, y) => fabric.util.transformPoint(new fabric.Point(x, y), vpt);
      context.save();
      (snapToBoothsRef.current && markBoothOverlapsRef.current ? findBoothOverlaps(canvas) : []).forEach(({ rect }) => {
        const a = toScreen(rect.l, rect.t);
        const b = toScreen(rect.r, rect.b);
        context.fillStyle = 'rgba(239, 68, 68, 0.18)';
        context.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        context.setLineDash([5, 3]);
        context.lineWidth = 2;
        context.strokeStyle = '#ef4444';
        context.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      });
      const guides = snapGuidesRef.current;
      if (guides) {
        // pink = touching, indigo dashed = aligned, green dashed = centre to centre, orange = equal spacing
        const GUIDE_STYLE = {
          touch: { dash: [], width: 3, color: '#ec4899' },
          align: { dash: [6, 4], width: 1.5, color: '#6366f1' },
          center: { dash: [4, 3], width: 1.5, color: '#10b981' },
          equal: { dash: [], width: 2, color: '#f97316' }
        };
        guides.lines.forEach(l => {
          const a = toScreen(l.x1, l.y1);
          const b = toScreen(l.x2, l.y2);
          const style = GUIDE_STYLE[l.kind] || GUIDE_STYLE.touch;
          context.beginPath();
          context.setLineDash(style.dash);
          context.lineWidth = style.width;
          context.strokeStyle = style.color;
          if (Math.hypot(b.x - a.x, b.y - a.y) < 2) {
            // corner to corner: small cross on the shared corner
            context.moveTo(a.x - 6, a.y); context.lineTo(a.x + 6, a.y);
            context.moveTo(a.x, a.y - 6); context.lineTo(a.x, a.y + 6);
          } else {
            context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
          }
          context.stroke();
          if (l.text) {
            // equal spacing: the gap in metres, in the guide's colour
            context.setLineDash([]);
            context.font = '600 10px system-ui, -apple-system, sans-serif';
            const w = context.measureText(l.text).width + 8;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            context.fillStyle = style.color;
            context.beginPath();
            if (typeof context.roundRect === 'function') context.roundRect(mx - w / 2, my - 8, w, 16, 4); else context.rect(mx - w / 2, my - 8, w, 16);
            context.fill();
            context.fillStyle = '#ffffff';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(l.text, mx, my + 0.5);
          }
        });
        if (guides.distance) {
          const d = guides.distance;
          const a = toScreen(d.x1, d.y1);
          const b = toScreen(d.x2, d.y2);
          context.beginPath();
          context.setLineDash([3, 3]);
          context.lineWidth = 1;
          context.strokeStyle = '#0ea5e9';
          context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
          context.stroke();
          context.setLineDash([]);
          context.font = '600 11px system-ui, -apple-system, sans-serif';
          const w = context.measureText(d.text).width + 10;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          context.fillStyle = '#0ea5e9';
          context.beginPath();
          if (typeof context.roundRect === 'function') context.roundRect(mx - w / 2, my - 9, w, 18, 4); else context.rect(mx - w / 2, my - 9, w, 18);
          context.fill();
          context.fillStyle = '#ffffff';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(d.text, mx, my + 0.5);
        }
      }
      context.restore();
    });

    // Element captions (also painted into PNG / PDF exports, which render through this event)
    canvas.on('after:render', ({ ctx }) => {
      const hits = drawElementCaptions(canvas, ctx || canvas.getContext(), { enabled: showCaptionsRef.current });
      if (hits && (!ctx || ctx === canvas.contextContainer)) captionHitsRef.current = hits;
    });

    // Selection event listeners
    const handleSelection = () => {
      const active = canvas.getActiveObject();
      const actives = canvas.getActiveObjects();
      onSelectionChange?.(active, actives);

      if (active && showDimensionsRef.current) {
        const vpt = canvas.viewportTransform;
        const screenX = active.left * vpt[0] + vpt[4];
        const screenY = (active.top - 15) * vpt[3] + vpt[5];
        const wM = (active.width * (active.scaleX || 1)) / gridScaleRef.current;
        const hM = (active.height * (active.scaleY || 1)) / gridScaleRef.current;
        const xM = active.left / gridScaleRef.current;
        const yM = active.top / gridScaleRef.current;
        setActiveDimension({
          wM: wM.toFixed(1),
          hM: hM.toFixed(1),
          xM: xM.toFixed(1),
          yM: yM.toFixed(1),
          screenX,
          screenY
        });
      } else {
        setActiveDimension(null);
      }
    };

    handleSelectionRef.current = handleSelection;

    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    // Text Box & Bentuk: the colour panel knows when part of the text is selected while typing
    canvas.on('text:selection:changed', (opt) => { if (isShapeElement(opt?.target)) handleSelection(); });
    canvas.on('text:editing:entered', (opt) => { if (isShapeElement(opt?.target)) handleSelection(); });
    // Canvas selection cleared listener
    canvas.on('selection:cleared', () => {
      onSelectionChange?.(null, []);
      setActiveDimension(null);
    });

    // CRITICAL: Ensure upperCanvasEl allows HTML5 drops without browser blockage
    const upperCanvas = canvas.upperCanvasEl;
    const onCanvasDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onCanvasDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onCanvasDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDropRef.current?.(e);
    };

    if (upperCanvas) {
      upperCanvas.addEventListener('dragover', onCanvasDragOver);
      upperCanvas.addEventListener('dragenter', onCanvasDragEnter);
      upperCanvas.addEventListener('drop', onCanvasDrop);
    }

    // Keyboard Shortcuts
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !isSpacePressedRef.current && e.target.tagName !== 'INPUT') {
        isSpacePressedRef.current = true;
        canvas.defaultCursor = 'grab';
        canvas.selection = false;
      }
      // Not while typing: a text field, or the text of a Teks / Text Box / Bentuk being edited on the canvas
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !canvas.getActiveObject()?.isEditing) {
        const active = canvas.getActiveObjects();
        if (active.length) {
          canvas.discardActiveObject();
          active.forEach(obj => {
            if (!obj.isBackgroundBlueprint) canvas.remove(obj);
          });
          canvas.requestRenderAll();
          notifyObjectsUpdate();
          onSelectionChange?.(null, []);
          pushHistory();
        }
      }
      // Arrow keys: 0,1 m per press, Shift = 1 m; booths stop exactly when they touch another booth, elements when
      // they touch an element or a booth (Alt = no stop)
      const ARROWS = { ArrowLeft: [-1, 0, 'left'], ArrowRight: [1, 0, 'right'], ArrowUp: [0, -1, 'up'], ArrowDown: [0, 1, 'down'] };
      const tag = e.target?.tagName;
      if (ARROWS[e.key] && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !e.target?.isContentEditable && !isPreviewModeRef.current) {
        const active = canvas.getActiveObject();
        if (active && !active.isEditing && !active.lockMovementX && !active.lockMovementY && !active.isBackgroundBlueprint) {
          e.preventDefault();
          const [sx, sy, dir] = ARROWS[e.key];
          let step = (e.shiftKey ? 1 : 0.1) * gridScaleRef.current;
          if (!e.altKey && snapToBoothsRef.current && containsBooth(active)) {
            step = limitStepToTouch(boxOf(active), snapTargets(canvas, active, { includeWalls: false }), dir, step);
          } else if (!e.altKey && elementSnapOn() && !containsBooth(active)) {
            const targets = elementSnapTargets(canvas, active, { booths: snapToBoothsRef.current, elements: snapToElementsRef.current });
            step = limitStepToTouch(movingGeometry(active).box, targets, dir, step, { all: true });
          }
          if (step > 0.01) {
            active.set({ left: active.left + sx * step, top: active.top + sy * step });
            active.setCoords();
            canvas.fire('object:modified', { target: active, action: 'drag' });
            canvas.requestRenderAll();
          }
        }
      }
      // Ctrl / Cmd + C / V: copy the selection, paste exact copies (also into another floorplan or Denah Operasional).
      // Pasted at the pointer when it is on the canvas, otherwise 1 m further for every paste.
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable || canvas.getActiveObject()?.isEditing;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && !typing && !isPreviewModeRef.current && ['c', 'v'].includes(e.key.toLowerCase())) {
        if (e.key.toLowerCase() === 'c') {
          const members = canvas.getActiveObjects().filter(o => !o.isBackgroundBlueprint && !o.isSalesLayer);
          if (members.length) {
            e.preventDefault();
            // an embedded image can make a copy huge: it is then kept for this tab only, never forced into localStorage
            const clip = { v: 1, objects: members.map(o => serializeForCopy(canvas, o)), pastes: 0 };
            memoryClipboard = clip;
            if (!safeSet(CLIPBOARD_KEY, clip, { maxSize: 1024 * 1024 })) {
              safeRemove(CLIPBOARD_KEY);
              onWarningRef.current?.('ℹ️ Salinan cukup besar: hanya bisa ditempel di tab ini (tidak ke denah / tab lain).');
            }
          }
        } else {
          let clip = null;
          clip = safeGetJson(CLIPBOARD_KEY, null) || memoryClipboard;
          if (clip?.objects?.length) {
            e.preventDefault();
            const xs = clip.objects.map(o => Number(o.left) || 0);
            const ys = clip.objects.map(o => Number(o.top) || 0);
            const pointer = lastPointerRef.current;
            let dx;
            let dy;
            if (pointer) {
              // centre of the copied objects' anchor points onto the pointer
              dx = pointer.x - (Math.min(...xs) + Math.max(...xs)) / 2;
              dy = pointer.y - (Math.min(...ys) + Math.max(...ys)) / 2;
            } else {
              clip.pastes = (clip.pastes || 0) + 1;
              dx = dy = clip.pastes * gridScaleRef.current;
              if (!safeSet(CLIPBOARD_KEY, clip, { maxSize: 1024 * 1024 })) memoryClipboard = clip;
            }
            const before = clip.objects.length;
            addCopiesRef.current?.(clip.objects, { dx, dy }).then(objs => {
              if (objs.length < before && layerModeRef.current === 'ops') {
                onWarningRef.current?.('Booth tidak ikut ditempel: booth hanya bisa dibuat di Denah Sales.');
              }
            });
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        ref.current?.undo?.();
      }
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') || 
          ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        ref.current?.redo?.();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        canvas.defaultCursor = 'default';
        canvas.selection = !isPanModeRef.current;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (upperCanvas) {
        upperCanvas.removeEventListener('dragover', onCanvasDragOver);
        upperCanvas.removeEventListener('dragenter', onCanvasDragEnter);
        upperCanvas.removeEventListener('drop', onCanvasDrop);
      }
      canvas.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Pan Mode
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.selection = !isPanMode;
    canvas.defaultCursor = isPanMode ? 'grab' : 'default';
  }, [isPanMode]);

  // Handle Blueprint
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (!blueprintData || !blueprintData.url) {
      if (blueprintObjRef.current) {
        canvas.remove(blueprintObjRef.current);
        blueprintObjRef.current = null;
        canvas.requestRenderAll();
        pushHistory();
      }
      return;
    }

    const currentBp = blueprintObjRef.current || canvas.getObjects().find(o => o.isBackgroundBlueprint);
    // The browser URL-encodes data:image/svg+xml sources in img.src, so also compare the raw URLs we stored
    const safeDecode = (u) => { try { return decodeURIComponent(u); } catch { return u; } };
    const targetUrl = safeDecode(blueprintData.url);
    const isSameImage = Boolean(currentBp) && [
      currentBp.blueprintData?.url,
      currentBp.src,
      currentBp.getSrc?.(),
      currentBp._element?.src
    ].some(u => u && safeDecode(u) === targetUrl);

    // Invalidate any image still decoding from an earlier blueprintData so it cannot overwrite this one
    const loadSeq = ++blueprintLoadSeqRef.current;

    // If already exists and image URL is the same, simply update properties without position jump or re-instantiation!
    if (isSameImage) {
      currentBp.set({
        opacity: blueprintData.opacity ?? 0.35,
        scaleX: blueprintData.scale ?? 1,
        scaleY: blueprintData.scale ?? 1,
        selectable: !blueprintData.isLocked,
        evented: !blueprintData.isLocked,
        hoverCursor: blueprintData.isLocked ? 'default' : 'move'
      });
      currentBp.blueprintData = {
        ...(currentBp.blueprintData || {}),
        ...blueprintData,
        opacity: blueprintData.opacity ?? 0.35,
        scale: blueprintData.scale ?? 1,
        isLocked: !!blueprintData.isLocked
      };
      blueprintObjRef.current = currentBp;
      canvas.sendObjectToBack(currentBp);
      canvas.requestRenderAll();
      pushHistory();
      return;
    }

    // New or changed image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    // In a non-base64 SVG data URL a raw '#' (e.g. fill="#f8fafc") starts the URL fragment and truncates the image
    img.src = /^data:image\/svg\+xml(;charset=[^;,]+)?(;utf8)?,/i.test(blueprintData.url)
      ? blueprintData.url.replace(/#/g, '%23')
      : blueprintData.url;
    img.onerror = () => console.warn('Blueprint image failed to load:', blueprintData.name || blueprintData.url.slice(0, 60));
    img.onload = () => {
      if (loadSeq !== blueprintLoadSeqRef.current) return;
      // A canvas load is in progress and will clear the canvas; it re-triggers this effect when done
      if (isStateRestoringRef.current) return;
      // Re-resolve: the canvas may have been reloaded while the image was decoding
      const currentBp = blueprintObjRef.current && canvas.getObjects().includes(blueprintObjRef.current)
        ? blueprintObjRef.current
        : canvas.getObjects().find(o => o.isBackgroundBlueprint);
      const prevX = currentBp ? currentBp.left : (blueprintData.x ?? 0);
      const prevY = currentBp ? currentBp.top : (blueprintData.y ?? 0);

      if (currentBp) {
        canvas.remove(currentBp);
      }

      const fImg = new fabric.FabricImage(img, {
        left: prevX,
        top: prevY,
        opacity: blueprintData.opacity ?? 0.35,
        scaleX: blueprintData.scale ?? 1,
        scaleY: blueprintData.scale ?? 1,
        selectable: !blueprintData.isLocked,
        evented: !blueprintData.isLocked,
        hoverCursor: blueprintData.isLocked ? 'default' : 'move'
      });

      const fullBpData = {
        name: blueprintData.name || (blueprintData.sourceType === 'sample' ? 'Contoh Denah – JCC Convention Hall' : 'Blueprint Denah'),
        sourceType: blueprintData.sourceType || (blueprintData.url.startsWith('data:image/svg') || blueprintData.url.includes('JCC') ? 'sample' : 'upload'),
        fileName: blueprintData.fileName || (blueprintData.sourceType === 'sample' ? 'jcc-convention-hall.svg' : 'blueprint.png'),
        fileSize: blueprintData.fileSize || null,
        uploadedAt: blueprintData.uploadedAt || new Date().toISOString(),
        url: blueprintData.url,
        opacity: blueprintData.opacity ?? 0.35,
        scale: blueprintData.scale ?? 1,
        isLocked: !!blueprintData.isLocked,
        x: prevX,
        y: prevY,
        ...blueprintData
      };

      fImg.isBackgroundBlueprint = true;
      fImg.src = blueprintData.url;
      fImg.blueprintData = fullBpData;
      blueprintObjRef.current = fImg;
      canvas.add(fImg);
      canvas.sendObjectToBack(fImg);
      canvas.requestRenderAll();
      pushHistory();
      onBlueprintLoaded?.(fullBpData);
    };
  }, [blueprintData, blueprintRetryTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // HTML5 Drag & Drop
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const canvas = fabricRef.current;
    if (!canvas || !containerRef.current) return;

    try {
      const dataStr = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);

      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const vpt = canvas.viewportTransform;
      const sceneX = (clientX - vpt[4]) / vpt[0];
      const sceneY = (clientY - vpt[5]) / vpt[3];

      // Don't snap raw drop coords here if we want to snap strictly by edges.
      // We will let createBoothObject use sceneX/sceneY, then snap its edges!
      const dropX = sceneX;
      const dropY = sceneY;

      if (data.itemType === 'booth') {
        const existingCount = canvas.getObjects().filter(o => o.isBooth).length + 1;
        const category = data.category || 'Standard';
        const catConfig = BOOTH_CATEGORIES[category] || BOOTH_CATEGORIES.Standard;
        const newBooth = createBoothObject({
          code: `A-${String(existingCount).padStart(2, '0')}`,
          category,
          shape: data.shape || 'rectangle',
          price: data.price !== undefined ? data.price : (catConfig?.defaultPrice || 5000000),
          widthM: data.widthM || catConfig?.widthM || 3,
          heightM: data.heightM || catConfig?.heightM || 3,
          gridScale,
          left: dropX,
          top: dropY,
          ownerName: data.ownerName || ''
        });
        if (snapToGrid) {
          newBooth.set({
            left: snapCoords(newBooth.left, gridScale, newBooth.originX, newBooth.width * newBooth.scaleX),
            top: snapCoords(newBooth.top, gridScale, newBooth.originY, newBooth.height * newBooth.scaleY)
          });
        }
        canvas.add(newBooth);
        canvas.bringObjectToFront(newBooth);
        canvas.setActiveObject(newBooth);
      } else if (data.itemType === 'venue') {
        const venueObj = createVenueObject({
          type: data.venueType || 'stage',
          gridScale,
          left: dropX,
          top: dropY
        });
        if (snapToGrid) {
          venueObj.set({
            left: snapCoords(venueObj.left, gridScale, venueObj.originX, venueObj.width * venueObj.scaleX),
            top: snapCoords(venueObj.top, gridScale, venueObj.originY, venueObj.height * venueObj.scaleY)
          });
        }
        canvas.add(venueObj);
        canvas.bringObjectToFront(venueObj);
        canvas.setActiveObject(venueObj);
      } else if (data.itemType === 'library' && ELEMENTS[data.elementType]) {
        const el = createLibraryElement(data.elementType, { cx: dropX, cy: dropY, gridScale: gridScaleRef.current });
        if (ELEMENTS[data.elementType].snapToWall) snapGateToWallOrDoor(el, canvas, gridScaleRef.current);
        canvas.add(el);
        placeOnLayer(canvas, el);
        canvas.setActiveObject(el);
        refreshPillarConflicts();
      } else if (data.itemType === 'door') {
        const door = createDoorObject({
          doorType: data.doorType,
          widthM: data.widthM,
          cx: dropX,
          cy: dropY,
          gridScale: gridScaleRef.current
        });
        snapDoorToWall(door, canvas, gridScaleRef.current);
        canvas.add(door);
        canvas.bringObjectToFront(door);
        canvas.setActiveObject(door);
      } else if (data.itemType === 'basic_shape') {
        const shapeObj = createBasicShapeObject(data.shapeId, {
          gridScale,
          left: dropX,
          top: dropY
        });
        if (snapToGrid) {
          shapeObj.set({
            left: snapCoords(shapeObj.left, gridScale, shapeObj.originX, shapeObj.width * shapeObj.scaleX),
            top: snapCoords(shapeObj.top, gridScale, shapeObj.originY, shapeObj.height * shapeObj.scaleY)
          });
        }
        canvas.add(shapeObj);
        canvas.sendObjectBackwards(shapeObj); // Shapes go behind booths
        canvas.setActiveObject(shapeObj);
      }

      canvas.requestRenderAll();
      handleSelectionRef.current?.();
      notifyObjectsUpdate();
      pushHistory();
    } catch (err) {
      console.error('Error dropping item to canvas', err);
    }
  };

  handleDropRef.current = handleDrop;

  // Calculate 1 meter box size in screen pixels
  const boxPixelSize = gridScale * (zoomLevel || 1);

  return (
    <div 
      ref={containerRef} 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative flex-1 w-full h-full overflow-hidden bg-slate-100 select-none"
    >
      {/* 
        CRITICAL FIX FOR GRID BUG:
        This element is PERMANENT in the DOM (never conditionally unmounted).
        Toggled purely via CSS opacity and pointer-events so Fabric.js container is NEVER detached!
        1 kotak = persis 1 meter!
      */}
      <div 
        className="absolute inset-0 pointer-events-none transition-opacity duration-200"
        style={{
          opacity: showGrid ? 1 : 0,
          backgroundImage: `
            linear-gradient(to right, rgba(203, 213, 225, 0.7) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(203, 213, 225, 0.7) 1px, transparent 1px),
            linear-gradient(to right, rgba(148, 163, 184, 0.9) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148, 163, 184, 0.9) 1px, transparent 1px)
          `,
          backgroundSize: `
            ${boxPixelSize}px ${boxPixelSize}px,
            ${boxPixelSize}px ${boxPixelSize}px,
            ${boxPixelSize * 5}px ${boxPixelSize * 5}px,
            ${boxPixelSize * 5}px ${boxPixelSize * 5}px
          `,
          backgroundPosition: `
            ${viewportTransform[4]}px ${viewportTransform[5]}px,
            ${viewportTransform[4]}px ${viewportTransform[5]}px,
            ${viewportTransform[4]}px ${viewportTransform[5]}px,
            ${viewportTransform[4]}px ${viewportTransform[5]}px
          `
        }}
      />

      {/* Fabric.js Canvas Container */}
      <canvas ref={canvasElRef} className="block" />

      {/* Rulers (Top & Left) */}
      <CanvasRuler
        viewportTransform={viewportTransform}
        width={containerDimensions.width}
        height={containerDimensions.height}
        mousePos={mousePos}
        visible={showRuler}
        gridScale={gridScale}
      />

      {/* Real-time Dimension Guide Pill */}
      {shapeResizeBadge && (
        <div
          className="pointer-events-none absolute z-20 bg-violet-700/95 text-white px-2 py-0.5 rounded-md text-[11px] font-mono font-bold shadow-lg -translate-x-1/2 -translate-y-full"
          style={{ left: shapeResizeBadge.x, top: shapeResizeBadge.y - 28 }}
        >
          {shapeResizeBadge.text}
        </div>
      )}

      {showDimensions && activeDimension && (
        <div 
          className="pointer-events-none absolute z-20 bg-slate-900/90 backdrop-blur-sm text-white px-2.5 py-1 rounded-md text-[10px] font-mono shadow-lg border border-slate-700/80 -translate-x-1/2 -translate-y-full transition-all"
          style={{ left: activeDimension.screenX, top: activeDimension.screenY - 8 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-blue-400 font-bold">{activeDimension.wM}m × {activeDimension.hM}m</span>
            <span className="text-slate-400">({activeDimension.xM}m, {activeDimension.yM}m)</span>
          </div>
        </div>
      )}

      {/* Full caption tooltip */}
      {captionTip && (
        <div
          className="absolute z-30 pointer-events-none px-2 py-1 rounded-md bg-slate-900/90 text-white text-[11px] font-semibold shadow-lg max-w-[260px] break-words"
          style={{ left: captionTip.x + 12, top: captionTip.y + 14 }}
        >
          {captionTip.text}
        </div>
      )}

      {/* Compact Status Pill at Bottom-Left */}
      <div className="absolute bottom-3 left-4 flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg border border-slate-800 text-[11px] shadow-sm select-none pointer-events-none z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span>Zoom: <b>{Math.round(zoomLevel * 100)}%</b></span>
        <span className="text-slate-600">•</span>
        <span className="text-slate-300">1 Grid = {gridScale}px (1m)</span>
      </div>

      {/* Tenant Preview Mode Overlay */}
      {isPreviewMode && (
        readOnlyNotice ? (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-max max-w-[92%] bg-slate-900 text-white px-4 py-1.5 rounded-2xl shadow-lg text-xs font-semibold flex items-center gap-2 z-20">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            {onBoothAction ? 'Mode Sales: klik booth untuk booking, buat invoice, atau beri diskon.' : 'Denah hanya bisa dilihat.'}
          </div>
        ) : (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-1.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 animate-bounce z-20">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            Mode Simulasi Pengunjung / Exhibitor (Live Floorplan Preview)
          </div>
        )
      )}

      {/* Floating Hover Card on Booth Mouse Over (Preview Mode Only) */}
      {isPreviewMode && hoveredBooth && (
        <div className="absolute bottom-6 right-6 z-40 bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-200/90 max-w-xs animate-fadeIn transition-all select-none pointer-events-auto">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              🎪 Booth {hoveredBooth.code || 'N/A'}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              hoveredBooth.status === 'available'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : hoveredBooth.status === 'reserved'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : hoveredBooth.status === 'free'
                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                : 'bg-rose-100 text-rose-800 border border-rose-300'
            }`}>
              {hoveredBooth.status === 'available' ? '🟢 Tersedia' : hoveredBooth.status === 'reserved' ? '🟡 Reserved' : hoveredBooth.status === 'free' ? '🔵 Free Booth' : hoveredBooth.status === 'maintenance' ? '⚙️ Maintenance' : '🔴 Terjual'}
            </span>
          </div>

          {hoveredBooth.ownerName ? (
            <div className="text-xs font-semibold text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 mb-2 truncate">
              Tenant: <b>{hoveredBooth.ownerName}</b>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic mb-2">
              Belum ada tenant terdaftar
            </div>
          )}

          <div className="text-xs text-slate-600 mb-1 flex items-center justify-between">
            <span>Kategori: <b className="text-slate-800">{hoveredBooth.category || 'Standard'}</b></span>
            <span>Ukuran: <b className="text-slate-800">{hoveredBooth.widthM || 3}x{hoveredBooth.heightM || 3}m</b></span>
          </div>

          {!hidePrices && (
            <>
              <div className={`text-xs font-bold text-slate-900 ${readOnlyNotice ? '' : 'mb-2.5'}`}>
                Harga Sewa: <span className="text-emerald-600 font-mono">{hoveredBooth.status === 'free' ? 'GRATIS' : `Rp ${(hoveredBooth.price || 0).toLocaleString('id-ID')}`}</span>
              </div>

              {/* Quick Actions in Hover Card (the read-only Studio uses the booth pop up instead) */}
              <div className={`pt-2 border-t border-slate-100 gap-1.5 ${readOnlyNotice ? 'hidden' : 'flex'}`}>
                <button
                  type="button"
                  onClick={() => onOpenBookingForBooth?.(hoveredBooth)}
                  className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer"
                >
                  📋 Booking Tenant
                </button>
                <button
                  type="button"
                  onClick={() => onOpenInvoiceForBooth?.(hoveredBooth)}
                  className="py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer"
                  title="Buat Tagihan / Invoice"
                >
                  📄 Invoice
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default CanvasEditor;
