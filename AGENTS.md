# Floorplan System Architecture & Critical Invariants (LOCKED)

> [!IMPORTANT]
> **DO NOT REMOVE OR BYPASS THESE INVARIANTS**:
> These rules ensure that all 15 booths and venue elements on the canvas are recognized, hydrated, interactive, and synced with SQLite database across both the Admin Dashboard and Live Floorplan.

---

## 1. Fabric.js Object Serialization & Deserialization
Fabric.js v7 does not automatically preserve custom object properties (`isBooth`, `boothData`, `isVenueItem`, `venueData`, `id`) unless revived or manually assigned.

- **On Canvas Save (`toObject`)**:
  Always serialize with custom properties. Use `toObject([...])` — in Fabric 7 `canvas.toJSON()` takes NO arguments and silently drops custom props:
  ```javascript
  canvas.toObject([
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
    'src'
  ]);
  ```
- **On Canvas Load (`loadFromJSON`)**:
  Always call `hydrateBoothObject(obj, rawObjects[idx], dbBooths)` from `floorplanUtils.js` immediately after loading.
- **Type Checking**:
  Always use case-insensitive type checks (`o.type?.toLowerCase() === 'text'`, `'rect'`, `'activeselection'`). In Fabric 7, `type` is capitalized (`'Text'`, `'Rect'`, `'ActiveSelection'`).

---

## 2. Universal Booth & Venue Hydration (`floorplanUtils.js`)
`hydrateBoothObject(obj, rawObj, dbBooths)` provides self-healing hydration:
- Reads dimension (`3x3m`, `6x3m`, `6x6m`), booth code (`A-01` to `VIP-02`), tenant name, and status (`AVAILABLE`, `RESERVED`, `SOLD`, `FREE`).
- Populates `obj.isBooth = true` and `obj.boothData = { id, code, category, status, price, ownerName, widthM, heightM, facilities }`.
- Sets `isVenueItem = true` and `venueData` for stage, entrance, exit, restroom, cafe, and pillars.
- Syncs latest status, tenant, and price from database rows.

---

## 3. Backend Database Safety Lock (`floorplanRoutes.js`)
- **`POST /api/floorplan/save`**:
  - Automatically verifies that `booths` are resolved. If `booths` array is empty or omitted, `extractBoothsFromFabricJson(fabricJson.objects)` extracts the booths from the canvas objects.
  - Automatically tags all objects in `fabricJson.objects` with `isBooth: true` and `boothData`.
  - Atomically syncs the `booths` and `venue_items` SQLite tables in a transaction.

---

## 4. Live Floorplan Interactivity (`LiveFloorplan.jsx`)
- **Cursor**: `hoverCursor: 'pointer'` on all booths.
- **Hover**: Shows the floating info preview card with badge, category, size, price, and tenant.
- **Click**:
  - **Available / Free**: Opens `BookingModal` for exhibitor registration and payment simulation.
  - **Reserved**: Shows alert with booking in-progress status.
  - **Sold**: Shows alert with the tenant/brand name.
- **Stats Card**: Shows real-time unit counts and percentage:
  - Total: 15
  - Available: 8 (53%)
  - Reserved: 1
  - Sold: 6

---

## 5. Strict 1-to-1 Booth Record Mapping & Deduplication Lock
- **No Cartesian Products**: Never use un-grouped `LEFT JOIN orders` or `LEFT JOIN invoices` directly against the `booths` query in `statsRoutes.js` or `orderRoutes.js`. Always use scalar subqueries (`SELECT ... WHERE booth_id = b.id ... ORDER BY created_at DESC LIMIT 1`) so that 1 booth record in SQLite ALWAYS produces exactly 1 row in `exhibitorsList`.
- **Project Isolation**: Always include `floorplan_id` / `projectId` filter in booth & order joins to prevent cross-project row duplication.
- **Frontend Deduplication Guarantee**: Maintain Map/Set deduplication layer in `SalesCharts.jsx` and `ExhibitorTable.jsx` using unique key `${floorplanId}_${boothCode}` to guarantee zero duplicate booth/tenant listings across all pages.

---

## 6. Invoice PDF, A4 View & Database Hydration Lock (`invoiceRoutes.js` & `InvoiceA4View.jsx`)
- **Full DB Column Selection & JSON Parsing**: `GET /api/invoices`, `POST /api/invoices`, and `PUT /api/invoices/:id` MUST perform `SELECT *` from `invoices` and parse `items_json` & `bank_details_json` into native JSON arrays/objects in API responses.
- **Normalization Layer**: `InvoiceA4View.jsx` MUST maintain a data normalization layer (`inv`) mapping both `camelCase` (`clientName`, `companyName`, `totalAmount`) and `snake_case` (`client_name`, `company_name`, `total_amount`) properties.
- **Item Fallback Guarantee**: If `items` array is empty, `InvoiceA4View` MUST fallback to generating item entries from `booth_code`, `booth_category`, and total amount so PDF export & A4 view NEVER render empty item tables or blank client names.

---

## 7. Multi-Project Master Brand Category Isolation Lock (`brandCategoryRoutes.js` & `SettingsPage.jsx`)
- **Project Scoping**: Brand categories MUST be scoped by `project_id` / `floorplan_id` in SQLite to ensure categories in one project do not pollute other projects.
- **Filtered Category Retrieval**: Category selectors in `ToolSidebar.jsx`, `ExhibitorTable.jsx`, and `BookingModal.jsx` MUST request project-specific brand categories via `GET /api/brand-categories?projectId=...`.
- **Save Per Project Action**: `POST /api/brand-categories/save-project` atomically persists project-specific category lists in SQLite.

---

## 8. Public Booking Checkout & Transactional Safety Lock (`orderRoutes.js` & `BookingModal.jsx`)
- **Atomic SQLite Transaction**: `POST /api/orders/checkout` MUST run inside an atomic `db.transaction()`:
  1. Inserts record into `orders` table.
  2. Updates booth status to `sold` / `reserved` and populates `owner_name` & `brand_category`.
  3. Creates or replaces corresponding record in `invoices` table.
  4. Parses and updates `canvas_fabric_json` in `floorplans` table to keep canvas objects and SQLite database 100% in sync.

---

## 9. Preset Layout Management & Persistence Lock (`db.js`, `floorplanRoutes.js` & `NewTemplateModal.jsx`)
- **Preset Table Storage**: Preset layouts MUST be persisted in SQLite table `preset_layouts` (`id`, `key`, `title`, `description`, `tag`, `canvas_fabric_json`, `metadata_json`, `is_system`).
- **Save as Preset Action**: Admin can convert any active floorplan or template card into a Preset Layout via `POST /api/floorplan/save-as-preset`.
- **Preset Deletion**: Custom preset layouts (`is_system = 0`) CAN be deleted by admin users directly via `DELETE /api/floorplan/presets/:id`.
- **Dynamic Preset Hydration**: `NewTemplateModal.jsx` and `presetLayouts.js` MUST fetch and hydrate preset layouts dynamically from `GET /api/floorplan/presets`.

---

## 10. Universal Payment Status Authority Lock (`invoices` Table Authority)
- **Single Source of Truth**: The `invoices` table (`payment_status`) is the canonical master authority for payment status across the entire application (Manajemen Invoice, Exhibitor Directory, Dashboard Stats, Live Floorplan, Studio, Orders).
- **Universal Synchronization**: `syncPaymentStatusFromInvoices()` in `syncPaymentStatus.js` ensures that when finance changes payment status (`PAID`, `UNPAID`, `PENDING`, `CANCELED`) or booth status (`sold`, `reserved`, `available`) in the Invoice Management page, all linked records across `booths`, `orders`, and `floorplans.canvas_fabric_json` are immediately synced.
- **Derived Exhibitor & Stats Status**: Endpoints `/api/orders`, `/api/exhibitors`, `/api/stats`, and `/api/floorplan` derive payment status and booth status from the booth **contract** (all its active DP / Pelunasan / Penuh invoices, see §14), never from a single "latest" invoice.

---

## 11. Authentication, Role Access & Audit Trail Lock (`middleware/auth.js`, `middleware/audit.js`, `utils/roles.js`)
- **Every `/api` request** passes `authenticate → enforceAccessPolicy → stampActorIdentity → auditTrail` (mounted in `index.js`). Endpoints not listed in `ACCESS_RULES` require a login by default; only the Live Floorplan / booking / facility-portal reads & submits are `public`.
- **Roles**: `superadmin` (everything), `finance` (invoices & payment status), `sales` (Studio/floorplan, tiers, brand categories), `operations` (Denah Operasional only, §17), `developer` (Pusat Maintenance only, §22). When adding an endpoint or admin page, update BOTH `ACCESS_RULES` (server) and `PAGE_ACCESS` (client `utils/roles.js`).
- **Actor identity comes from the session only**: `adminName`, `deletedBy`, `restoredBy`, `confirmedBy`, `registeredBy` in request bodies are overwritten with the logged-in user's name; anonymous requests cannot set `source: 'admin'`.
- **Client API calls** must go through `apiFetch` (`services/session.js`) so the bearer token is attached and revoked sessions log the user out.
- **Audit**: authenticated mutations are written to `audit_logs` automatically; add a readable rule in `AUDIT_RULES` for new mutating endpoints.

## 12. Precise Booth Matching Lock (`syncPaymentStatus.js`, `orderRoutes.js`)
- Match a booth to an invoice/order ONLY by: exact code (case-insensitive), merged-code tokens (`('+' || code || '+') LIKE '%+' || X || '+%'`), or a **non-empty** booth id — always scoped to the floorplan.
- **Never** use substring matching (`LIKE '%' || code || '%'`: `A-1` hits `A-10..A-19`) or id matching on a possibly empty value (`id LIKE '%' || ''` matches every booth and once overwrote a whole project's tenants).
- Public checkout must reject booths that are already `sold`/`reserved` (409) or not found (404); staff may re-assign.
- Public registration offers only `booking` (Hold 24 Jam) and `manual_transfer`; the API rejects any other `bookingType` from anonymous visitors (there is no real payment gateway). Instantly-PAID registrations (`payment_gateway` internally) are staff-only. A DP chosen at registration is a plan: `paid_amount` stays 0 until finance confirms payment.

## 13. Live Denah Shows Only the Published Floorplan (`floorplanRoutes.js`, `LiveFloorplan.jsx`)
- `GET /floorplan/events`, `/active` and `/:id` return **only `status = 'published'`, non-trashed** floorplans in the public view (anonymous visitors always; staff when `?view=public`). `/active` never falls back to a draft in the public view.
- `LiveFloorplan.jsx` must request `{ view: 'public' }` so a logged-in admin sees exactly what visitors see. The Studio calls these endpoints without it and still sees every project.
- `POST /orders/checkout` from visitors is only allowed on a published floorplan.
- **Several floorplans can be live at once**, each on its own link `/live/<public_slug>` (`floorplans.public_slug`, created on first publish and kept on re-publish). `POST /floorplan/:id/publish` never demotes other floorplans; `POST /floorplan/:id/unpublish` turns one back into a draft (its link then shows "Link Denah Tidak Ditemukan", never another floorplan). `/` and `/portal` show the most recently published floorplan.

## 14. Booth Contract Billing: Invoice DP & Pelunasan (`utils/contractBilling.js`)
- **Contract** = one booth in one floorplan. `invoices.invoice_kind`: `dp` (max one active), `settlement` (Pelunasan, max one active, `related_invoice_id` → its DP), `full` (single / legacy invoice, e.g. checkout drafts), `facility` (add-ons: never part of the contract, never change the booth).
- **Contract value** (`contract_total`, snapshot on every contract invoice) = booth price − private discount (+ PPN `contract_tax_rate`). Legacy invoices: contract value = their total.
- **Status per contract** (`summarizeContract`): paid ≥ contract → PAID / booth `sold`; paid > 0 → PARTIAL ("Uang Muka") / `reserved`; unpaid → UNPAID / `reserved`; all canceled → `available`. Always use `getContract()` / `summarizeContract()`; never read the latest invoice.
- **Amounts are computed on the server** (`POST /api/invoices` with `invoiceKind: 'dp' | 'settlement'`). Pelunasan = contract − DP. `recalcContract()` rewrites only the unpaid balance invoice after a price/discount change or a DP cancel/delete; paid invoices are never rewritten. A DP turns an unpaid `full` invoice into the Pelunasan.
- Paid contract invoices cannot be deleted (409); canceling a paid DP needs `confirmCancelPaidDp` and is written to the audit log. Deleted invoices are soft-deleted (`deleted_at`).
- **Client summaries** (`client/src/utils/invoiceSummary.js`) count each contract once (total, discount, paid, remaining) via `inv.contract`; tabs filter by the contract status.


## 15. Exhibitor Directory: Tahun → Project → Tenant (`ExhibitorTable.jsx`, `ProjectYearFolderSelector.jsx`)
- The directory reuses `ProjectYearFolderSelector` with `mode="directory"` (project subfolders + `renderProjectContent`); `storageKey` keeps each page's open folders / preferences separate (Manajemen Invoice keeps the default `invoice_project`). Folder years use WIB (`getProjectDateInfo`).
- "Total Tagihan" is the booth contract value (price − private discount, see §14), also for booths without invoices; `contractMismatch` flags contracts issued before the booth was re-priced or merged.
- One booth, one tenant: `POST /orders/checkout` rejects (409) assigning a booth (or part of a merged booth) whose contract already received a payment from another tenant; release it first with "Lepas Tenant".

---

## 16. Element Caption Lock (`elementCaptions.js`)
- **Overlay, not objects**: Captions are painted in the canvas `after:render` event via `drawElementCaptions()` (Studio `CanvasEditor.jsx` and `LiveFloorplan.jsx`). Never add caption text as Fabric children: icons, selection bounds, and saved geometry must stay unchanged. Exports (`toDataURL` / PDF) render through the same event, so captions are printed automatically.
- **Data**: `venueData.caption` holds the custom text (`''` means use the short Indonesian default name from `defaultCaption()`). `venueData.showCaption === false` hides the caption for one element. Library elements and doors mirror the custom caption in `venueData.label`. The floorplan-wide switch is `metadata.display.showCaptions`.
- **Export**: `exportToPRDJson` writes `caption`, `captionText`, and `showCaption` into `venue_items.properties_json`.
- **Rules**:
  - Walls and `text_label` elements have no caption.
  - Captions hide below zoom `CAPTION_HIDE_ZOOM`.
  - Long text is shortened with "…"; hover or tap shows the full text.
  - Captions never cover booth labels. They auto-shift, or are skipped when no free spot exists.
  - Live shows captions only for visible (public) elements.

---

## 17. Denah Operasional: Operational Layer Lock (`opsRoutes.js`, `utils/opsLayer.js`, `OpsFloorplanStudio.jsx`)
- **One floorplan, two layers.**
  - The sales layer (booths, walls, structures, doors, stage, blueprint) is always read live from `floorplans.canvas_fabric_json`. It is never copied into the operational layer.
  - The operational layer lives in `ops_elements`. It holds one row per element with the Fabric object JSON, flagged `isOpsItem`.
  - Per-booth operations data lives in `ops_booth_data`: power, water, internet, setup status, notes.
  - Neither table ever writes to `booths`, `orders`, `invoices`, or the sales canvas.
- **Operations mode (`/admin/ops`) saves only the operational layer**, through `PUT /api/ops/:id` with optimistic locking on `baseVersion` (409 `OPS_VERSION_CONFLICT`).
  - Sales objects are loaded with `isSalesLayer`, locked, and dimmed at runtime. `onStateLoaded` re-applies this after every load and after undo/redo.
  - Serialize operational objects with `canvas._toObject(obj, 'toObject', OPS_SERIALIZE_PROPS)`. Objects inside an active multi-selection would otherwise be saved with relative coordinates.
- **Role `operations`.**
  - It can reach only `/api/ops/*`, `/api/notifications/*`, and its own account (`OPERATIONS_AREA` in `auth.js`).
  - On public endpoints it is treated as an anonymous visitor.
  - `sanitizeSalesCanvas` strips prices, discounts, and billing data from boothData.
  - Sales can only read the layer: the "Lapisan Ops" overlay in the sales Studio uses `isOpsOverlay` + `excludeFromExport`, and `exportToPRDJson` skips those objects.
- **Anchors.**
  - `venueData.anchor = { boothId, boothCode, dx, dy, dAngle }`, with the offset expressed in the booth's own frame.
  - `resolveAnchors()` moves anchored elements onto their booth on every load, and flags `anchorOrphaned` when the booth was deleted. The element is never deleted.
  - `rebuildLibraryElement` must keep `anchor`, `anchorOrphaned`, `connections`, and `isOpsItem`.
- **Public visibility.** Operational elements are internal by default (`publicVisible: false`). Only the Super Admin may set `publicVisible` (the server enforces this). The Live Floorplan adds only `GET /api/ops/:id/public` elements.
- **Sales changes.**
  - `POST /floorplan/save`, checkout, and detach call `notifyIfBoothsChanged` / `notifyOpsOfSalesChange`, which create in-app notifications for operations users.
  - "Perubahan dari Sales" diffs the booth snapshot stored in `ops_seen` (updated when the page is opened with `markSeen=1`) against the current booths, and adds live updates while the page is open (15 s version polling).
- **Audit.** Operational saves write their own entries in category `Operasional`: add / change (coalesced per element for 10 minutes) / delete / booth data. They set `req.skipAudit`.

---

## 18. Auto-Merge Booth Lock (`shared/boothGroups.js`, `utils/boothMerge.js`, `boothMergeGroups.js`)
- **Booths never change.**
  - A merge group is display-only, computed from the canvas geometry (`computeMergeGroups`, one shared module for server and client).
  - Booth rows, positions, sizes, and prices stay as they are.
  - The client paints members through a runtime `render()` patch (`refreshMergeRendering`); nothing is saved in the canvas JSON.
- **Adjacency.**
  - Two booths merge only when they share a side: collinear, opposite-direction edges; gap ≤ `MERGE_GAP_M` (0.1 m); shared length ≥ `MIN_SHARED_M`. Touching at a corner does not count.
  - Walls, pillars, aisles, and other `MERGE_OBSTACLE_TYPES` lying on the shared side block the merge.
  - Groups chain (union-find). Only `reserved` / `sold` booths with the same `exhibitor_id` take part.
- **Exhibitor ID.**
  - `exhibitorIdFor(email, company)` in `utils/exhibitorIdentity.js`: a hash of the email, falling back to the company name for old data. Never compare brand-name text.
  - Stored in `booths.exhibitor_id` and `orders.exhibitor_id`. Kept by `syncPaymentStatus`, checkout, and floorplan save. Cleared on detach or Available.
- **Display switches.** `booths.merge_separate` / `boothData.mergeSeparate` ("Tampilkan Terpisah", set via `POST /floorplan/:id/merge-display`). Project-wide switch: `metadata.display.autoMerge`.
- **Checkout.**
  - One `POST /orders/checkout` with `boothCodes[]`. It is rejected with 409 plus `unavailable` when a booth was just booked.
  - One contract (invoice `booth_code` "A-01+A-03+A-04", one item per booth with a `boothCode` field) per cluster of adjacent booths.
  - A cluster touching an **unpaid** contract of the same exhibitor extends that contract. A paid or DP contract is never changed: the new booths get their own contract, plus a warning.
- **Unmerge.** Detach or Available on one booth of a multi-booth contract uses `removeBoothFromInvoice`: an unpaid invoice is recalculated; a paid or DP invoice keeps its amounts, drops only the code, and returns a warning. Groups re-split automatically.
- **Contract value of "A-01+A-03" = sum of its booths** (`contractValueForCode`, used by `recalcContract`).
- **Data Exhibitor.**
  - The API keeps one row per booth (§5), with `mergeGroup` and a per-booth share of the contract (`contractShare`).
  - `ExhibitorTable` collapses the group into one row "#A-01+A-03+A-04" (`collapseMergedRows`).
  - The dashboard still counts original booths.

---

## 19. Sudut Booth & Snap Sesama Booth (`floorplanUtils.js`, `boothSnap.js`, `CanvasEditor.jsx`)
- **Sudut Booth is display only.**
  - The value is a % of the booth's shortest side (0–50, default 0 = siku). Radius = pct × shortest side, capped at half of it.
  - Global per floorplan: `metadata.display.boothCornerPct`, kept on `canvas.boothCornerPct`. Per booth: `boothData.cornerPct`, where null means "Ikuti Pengaturan Denah". The legacy shape "Sudut Membulat" (`rounded`) means 20% until a value is set.
  - Always go through `applyBoothCorners(canvas, pct)` / `effectiveCornerPct()`. It sets the rect `rx`/`ry` and keeps the category strip inside the corners. Studio, Live, Denah Operasional and exports all call it.
  - It is applied inside `onStateLoaded`, so opening a floorplan never marks it as changed.
  - Never use the corner in geometry: size, area, adjacency, snapping and price use the square rectangle.
- **Merged outline.**
  - `outlineLoops()` + `isConvexVertex()` round only convex corners; concave (inner) corners stay siku.
  - The top-most member paints the whole group, so touching sides never show a double line.
  - Members with different corner values use the floorplan setting.
- **Snap ke Booth (sales Studio only: `snapToBooths` prop; the ops page leaves it off).**
  - `computeSnap()` works on the real rectangle (AABB after 0/90/180/270° rotation, outer box of a multi-selection). Threshold: `SNAP_SCREEN_PX / zoom`.
  - Per axis: touch (side to side, only when the boxes face each other) or align (same side, any distance). The closest candidate wins; on a tie, touch wins. An axis without a booth candidate falls back to Snap to Grid.
  - Resize snaps the dragged side.
  - Arrow keys move 0,1 m (Shift: 1 m) and stop at a touching booth (`limitStepToTouch`).
  - Alt / Option disables snapping. Copy-by-drag is Ctrl/Cmd only.
  - Booth positions are rounded to 0,01 m on `object:modified`.
  - Overlapping booths are marked red, and a warning is shown after the move.
- **Save route:** `activeOrders` ignores canceled / deleted orders. Otherwise a released booth (unmerge / Lepas Tenant) came back as Reserved on the next Studio save.

---

## 20. Public Data Protection Lock (`utils/publicData.js`)
- **Public view** of `GET /floorplan/active` and `/floorplan/:id` (anonymous visitors, or staff with `?view=public`) goes through `publicFloorplanPayload()`.
  - Canvas boothData is whitelisted: no `picName`, `email`, `phone`, `registeredBy`, or discounts.
  - Internal library elements are dropped.
  - Metadata keeps only event, floorplan, and display (the exported booth list carries discounts).
  - `exhibitor_id` / `boothData.exhibitorId` are replaced by an opaque per-floorplan alias (`PX-…`). Auto-merge only needs equality. The alias salt is `PUBLIC_ALIAS_SALT` (random per process if unset).
  - When adding a field to boothData or booth rows, decide explicitly whether it belongs in `PUBLIC_BOOTH_FIELDS`. Never show PIC, contact, or discount data publicly.
- **`GET /orders/check-client`**: visitors receive only `{ exists }`. Contact details are returned to logged-in staff only.
- **`GET /invoices/config`**: visitors never receive the signature image.
- **CORS**: only localhost / 127.0.0.1 (any port) plus the origins listed in `ALLOWED_ORIGINS`.
- **`src/resetDb.js`** (wipes all projects and transactions) runs only with `ALLOW_DB_RESET=yes` and `--confirm-wipe`, never with `NODE_ENV=production`, and always writes `data/backups/pre-reset_*.db` first.

---

## 21. Operations Lock: Git, Backup, Staging & Tests (`utils/backup.js`, `ops/`, `server/test/`)
- **Git**: `main` is the production branch. Changes are made on a branch (`fix/<nama-error>`, `feat/...`), tested, then merged. Never commit `server/data/`, `*.db`, backups, `.env` or `.staging/` (see `.gitignore`).
- **Secrets** live only in `server/.env` (template: `server/.env.example`), e.g. `ANTHROPIC_API_KEY`. Never in client code, `VITE_*` variables, logs, audit entries, or API responses. `db.js` loads `.env` before resolving `DATA_DIR`.
- **Backup**:
  - `createBackup()` uses the SQLite online backup, then verifies the copy with `integrity_check`, and writes `backup-status.json`.
  - The server makes one `daily` backup per day (`startBackupSchedule`, off with `BACKUP_DISABLED=1`).
  - Manual backup: `npm run backup`. Retention: `BACKUP_KEEP_DAILY` (14 days) and `BACKUP_KEEP_OTHER` (90 days).
  - Take a backup before every production migration or deploy. `/api/health` shows `lastBackupAt`.
- **Staging (this computer)**: `node ops/staging.mjs up <branch|commit>`.
  - It creates a git worktree in `.staging/app` and runs API on 5101 and web on 3101, with `APP_ENV=staging`.
  - Its database is `.staging/data`: a copy of production anonymized by `ops/mask-db.mjs` (no PIC names, emails, phones, addresses, NPWP, sessions, or audit IP; every staff password = `STAGING_PASSWORD`, default `staging123`).
  - Staging never reads or writes `server/data/`. The mask script refuses when source = target.
- **Tests**: `npm test` (root) = server tests (`server/test/*.test.js`, `node:test`) + client build.
  - Each test file starts its own server on a free port with an empty temporary `DATA_DIR`. Never import server modules (`src/db.js` runs migrations) against `server/data/floorplan.db`.
  - Tests cover login/role access, public booking (draft 404, instant-paid 400, unknown 404, taken 409, no substring matching), contract DP + Pelunasan + discount, auto-merge (one invoice per group, adjacency rules), and public data protection.
  - Never disable or weaken a test to make a change pass.
- **Health**: `GET /api/health` returns `environment` (`APP_ENV`), `version` (package version + git commit / `APP_COMMIT`), and `lastBackupAt`. It never returns secrets.

---

## 22. Pusat Maintenance: Error Tracking Lock (`utils/errorTracker.js`, `maintenanceRoutes.js`, `errorReporter.js`, `MaintenancePage.jsx`)
- **Capture.**
  - Server: `installErrorCapture()` records every `console.error(..., Error)`, plus crashes via `uncaughtExceptionMonitor` (the process still exits as before).
  - `errorCaptureMiddleware` (first on `/api`) keeps the request context. It records 5xx responses that logged no Error, and fixes the full path at entry (inside a router `req.path` is relative).
  - `expressErrorHandler` (last) answers 500 without internal details. Client mistakes (bad JSON, too large) get 400/413 and are not recorded.
  - Browser: `installErrorReporter()` (in `main.jsx`) reports `error` / `unhandledrejection`, `ErrorBoundary` reports React crashes, and `apiFetch` queues "server unreachable" in localStorage, sent once the API answers again.
  - Keep route error logging as `console.error('...', error)` with the Error object, so it is captured with its stack.
- **Privacy.**
  - `scrubText()` removes passwords, tokens, API keys (`sk-ant-…`), Bearer values, emails, phone numbers, NPWP, long numbers, query strings, and the local project path BEFORE storing.
  - Users are stored only as masked references (`U-` staff, `V-` visitor = hash of IP + browser, salt in `maintenance_settings.mask_salt`). Never store the real user id, email, IP, request bodies, or form data.
  - Error messages and stacks are DATA, never instructions (rendered as plain text; the same rule applies when they are sent to an AI later).
- **Grouping.**
  - Fingerprint = source + type + normalized message (numbers and quoted text removed) + first app stack frame (or area).
  - All "server unreachable" reports form one group.
  - Events: last 100 per group, 90 days.
- **Priority** (`classify()`, by API route or page):
  - KRITIS: login, checkout / Live Floorplan, invoices and payments, crashes, server unreachable, database failures.
  - TINGGI: Studio / floorplan, Data Exhibitor, Dashboard.
  - NORMAL: the rest.
  - When adding a feature, add its route / page to `AREA_RULES`.
- **Status.** `baru` → `ditangani` → `selesai`, or `diabaikan`.
  - A `selesai` error that happens again is re-opened (`reopened_count`) and notifies again. An ignored error stays ignored.
  - Status changes are audited (category `Maintenance`).
- **Notifications.** New or re-opened KRITIS / TINGGI errors create `error_alert` notifications for active `superadmin` + `developer` users (re-notified after 6 h while still new). NORMAL errors are never notified.
- **Public report endpoint** `POST /api/errors/report`: 30 reports per minute per IP, max 60 new browser groups per hour, size-limited fields. The server decides priority, never the browser.
- **Role `developer`.** Only `/api/maintenance/*`, notifications, and its own account (`DEVELOPER_AREA`). No tenant, price, invoice, or user data. On public endpoints it is treated as a visitor (`req.restrictedUser` keeps it only for masked error reports).

