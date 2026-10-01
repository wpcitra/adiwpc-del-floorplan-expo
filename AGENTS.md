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
- **One invoice row for every page**: `GET /api/invoices` and `GET /api/invoices/:id` both build the row with `INVOICE_ROW_SQL` + `invoiceRowMapper()`, so Manajemen Invoice, Data Exhibitor, the A4 document and WhatsApp show exactly the same invoice. Data Exhibitor opens the booth's real invoices (a picker when there are several) and never generates a document of its own; a booth without an invoice is offered "Buat Invoice".
  - Every exhibitor row carries `invoices` (active contract + facility invoices of that booth, precise matching §12), shown as buttons: Sales opens, prints and downloads what Finance issued. Editing, issuing and the layout editor stay with Finance / Super Admin (hidden in the UI, 403 on the server).
  - `findBooth()` resolves a multi-booth invoice code ("A-01+A-09") through its first booth, so the contract of a checkout with several booths or an auto-merge group opens like any other.
- **Editing an issued invoice** (`InvoiceEditModal`, the same form in both menus): client data via `PUT /api/invoices/:id` (a missing `items` never wipes the items); DP amount, contract PPN and display choices via `POST /api/invoices/:id/terms`.
  - The DP amount changes only while the DP is unpaid (409 `DP_ALREADY_PAID`); the unpaid Pelunasan follows (contract − DP). An unpaid "Penuh" invoice can be split into DP + Pelunasan (`POST /invoices` with `invoiceKind: 'dp'`).
  - A contract PPN change needs `changeContractTax` (409 `TAX_CHANGE_CONFIRM`), is refused on a fully paid contract, and also recomputes an unpaid DP.
  - `invoices.display_json` holds per-invoice choices (`INVOICE_DISPLAY_KEYS`): layout keys override Desain Layout Invoice for that invoice; `showDiscount`, `showContractBox`, `showBank`, `showNotes` default to shown. Hiding the discount shows the lines after the discount; the total never changes.
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
  3. Creates the corresponding record in `invoices` table. Only exception: a staff "Booking Manual" (`deferInvoice: true` with `bookingType: 'booking'`, §27) reserves the booth now and gets its invoice later.
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
- **Roles**: `superadmin` (everything), `finance` (invoices, payment status, private booth discount), `sales` (see below), `operations` (Studio + Denah Operasional, see below and §17), `developer` (Pusat Maintenance only, §22). Only `superadmin` and `operations` edit a floorplan (`canEditFloorplan`); only `superadmin` and `sales` register a tenant (`canRegisterTenant`).
- **Sales is limited to two menus** (`PAGE_ACCESS`: `floorplan`, `exhibitors`):
  - Studio is read-only (`canEditFloorplan(role)` → `readOnlyStudio` in `AdminDashboard.jsx`): the locked preview canvas, no tool sidebar / Property Inspector, no Simpan / Publish / Buat Baru / Tier / Preset / Blueprint, autosave off (`handleSaveDraft` returns). A click on any booth opens the booth pop up (Buat Invoice / Booking Manual / Beri Diskon, §27).
  - Sales books (Reserved) but never records a payment: `POST /orders/checkout` refuses `payment_gateway` (403) and an already booked booth (409 `BOOTH_TAKEN`) for this role.
  - Data Exhibitor: open, print, download and "Kirim WhatsApp" (`InvoiceA4View` `allowSend`) the invoices; no editing or issuing.
  - Server: every write under `/floorplan`, `/categories`, `/brand-categories`, `/invoices` (incl. `sync-booth-discount`) and `/ops/:id/copy-from` is refused for Sales (403). Its discount and invoice go through `/booth-actions/*` only (§27).
- **Operasional sees two menus** (`PAGE_ACCESS`: `floorplan`, `ops`) and uses every Studio feature (draw, move, price, tiers, presets, blueprint, save, publish) **except registering a client / brand**:
  - Client (`tenantLocked = !canRegisterTenant(role)` in `AdminDashboard.jsx` → `PropertyPanel`): no "Daftarkan" / "Lengkapi Biodata" / "Lepas Tenant", the tenant block is read-only, booth status and private discount are disabled. The sidebar hides "Katalog Invoice" (`canAccessPage(role, 'invoices')`).
  - Server: `POST /orders/checkout` is refused (403, `denyRoles` in `ACCESS_RULES`). `POST /floorplan/save` by this role keeps every existing booth's status, tenant, biodata, exhibitor id and private discount from the booths table, whatever the canvas sends; a new booth is saved as Available without a tenant. Invoices, orders, exhibitors, stats, settings and users stay closed (403).
  - `OPERATIONS_AREA` now includes `/floorplan` and `/categories` / `/brand-categories`; on those paths the role is staff (it sees draft floorplans, prices and tenant biodata in the Studio). On other public endpoints it is still treated as a visitor. When adding an endpoint or admin page, update BOTH `ACCESS_RULES` (server) and `PAGE_ACCESS` (client `utils/roles.js`).
- **Actor identity comes from the session only**: `adminName`, `deletedBy`, `restoredBy`, `confirmedBy`, `registeredBy` in request bodies are overwritten with the logged-in user's name; anonymous requests cannot set `source: 'admin'`.
- **Client API calls** must go through `apiFetch` (`services/session.js`) so the bearer token is attached and revoked sessions log the user out.
- **Audit**: authenticated mutations are written to `audit_logs` automatically; add a readable rule in `AUDIT_RULES` for new mutating endpoints.

## 12. Precise Booth Matching Lock (`syncPaymentStatus.js`, `orderRoutes.js`)
- Match a booth to an invoice/order ONLY by: exact code (case-insensitive), merged-code tokens (`('+' || code || '+') LIKE '%+' || X || '+%'`), or a **non-empty** booth id — always scoped to the floorplan.
- **Never** use substring matching (`LIKE '%' || code || '%'`: `A-1` hits `A-10..A-19`) or id matching on a possibly empty value (`id LIKE '%' || ''` matches every booth and once overwrote a whole project's tenants).
- Public checkout must reject booths that are already `sold`/`reserved` (409) or not found (404); staff may re-assign.
- Public registration: the visitor chooses Bayar Penuh or a DP of at least `publicMinDpPercent` (Setting > Aturan Booking, default 20%) and below 100%; other values get 400. The checkout response carries the issued invoice (`order.invoice`, built by `buildInvoiceRow`) so the registrant downloads the real invoice on the "Selesai" step; visitors cannot open invoices later. The Live page keeps the booking form open after a successful booking (`bookingModalBooths`) until the visitor closes it.
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
- **One registration = one invoice** (`POST /orders/checkout`): every booth ordered together goes on ONE invoice (`booth_code` "A-01+A-05+B-02", one item per booth with `boothCode`), adjacent or not. Checkout never splits an order per cluster and never appends it to an older invoice.
- **PPN choice** (`utils/taxSettings.js`): the rate is `taxRate` of the invoice configuration (Setting > Aturan Booking, PPN & Pajak).
  - Staff choose "Dengan PPN" / "Tanpa PPN" per invoice: checkout `applyTax` + `taxRate`, the DP / Pelunasan wizard for a contract without invoices, and the invoice edit form.
  - Visitors cannot choose: `publicBookingTax` (default true) decides.
  - Checkout computes the invoice itself: Σ price − private discounts, + PPN, stored in `tax_rate` / `tax_amount` / `contract_tax_rate`. The total sent by the form is ignored.
  - Editing a `full` invoice's total / PPN also updates its `contract_total` / `contract_tax_rate` (a full invoice is the whole contract).
- **Amounts are computed on the server** (`POST /api/invoices` with `invoiceKind: 'dp' | 'settlement'`). Pelunasan = contract − DP. `recalcContract()` rewrites only the unpaid balance invoice after a price/discount change or a DP cancel/delete; paid invoices are never rewritten. A DP turns an unpaid `full` invoice into the Pelunasan.
- Paid contract invoices cannot be deleted (409); canceling a paid DP needs `confirmCancelPaidDp` and is written to the audit log. Deleted invoices are soft-deleted (`deleted_at`).
- **Client summaries** (`client/src/utils/invoiceSummary.js`) count each contract once (total, discount, paid, remaining) via `inv.contract`; tabs filter AND count by the contract status (`matchesStatusTab`), so a paid DP is "Uang Muka / DP", never "Lunas". After a status change the UI reports the booth status returned by the server, never the one it asked for.
- **A DP chosen at registration** is `downPaymentPercent` × the contract value computed by the server; the form's `paidAmount` estimate is ignored (a stale booth price once produced "DP 50%" billing 30%).


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
  - Per-booth operations data lives in `ops_booth_data`: power, water, internet, setup status, notes, and **special design** (`special_design`, `special_color`).
  - Special design is the only booth "edit" the operations team has. It marks a custom-built stand and gives the booth its own colour on the operational floorplan: drawn by `drawOpsOverlay`, with a per-colour legend in the export. The sales booth object and its data are never changed.
  - Neither table ever writes to `booths`, `orders`, `invoices`, or the sales canvas.
- **Operations mode (`/admin/ops`) saves only the operational layer**, through `PUT /api/ops/:id` with optimistic locking on `baseVersion` (409 `OPS_VERSION_CONFLICT`).
  - Sales objects are loaded with `isSalesLayer`, locked, and dimmed at runtime. `onStateLoaded` re-applies this after every load and after undo/redo.
  - Serialize operational objects with `canvas._toObject(obj, 'toObject', OPS_SERIALIZE_PROPS)`. Objects inside an active multi-selection would otherwise be saved with relative coordinates.
- **Role `operations`.**
  - It can reach `/api/ops/*`, `/api/notifications/*`, its own account, and the Studio area (`/api/floorplan/*`, categories; `OPERATIONS_AREA` in `auth.js`, rules in §11).
  - On public endpoints outside that area it is treated as an anonymous visitor.
  - In Denah Operasional `sanitizeSalesCanvas` still strips prices, discounts, and billing data from boothData.
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
  - Member corners are always scene coordinates (`coordsOf` maps a booth inside a multi-selection back through the selection's matrix: its `calcACoords()` is relative to the ActiveSelection). The group matrix is undone on the context only when the booth is painted by its group (`group._transformDone`); with `preserveObjectStacking` (Studio) the canvas paints it directly. Otherwise selecting every booth of a merged group made the shape vanish (only the selection box stayed).
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
  - One invoice for the whole registration, adjacent or not (§14). Adjacent booths are still SHOWN merged on the floorplan (the response's `contracts` lists those display groups).
- **Unmerge.** Detach or Available on one booth of a multi-booth contract uses `removeBoothFromInvoice`: an unpaid invoice is recalculated; a paid or DP invoice keeps its amounts, drops only the code, and returns a warning. Groups re-split automatically.
- **Contract value of "A-01+A-03" = sum of its booths** (`contractValueForCode`, used by `recalcContract`).
- **Private discount on a multi-booth contract**: "Simpan Diskon" (`POST /invoices/sync-booth-discount`) and a Studio save that changes a booth's price or discount (`POST /floorplan/save`, change detected against the booths table) both call `recalcContract`. The unpaid Penuh / Pelunasan then shows subtotal = sum of the booth prices, discount = sum of their discounts (one booth keeps its own type, e.g. 10%), booth lines at the booth prices, total with PPN. Never write discount / subtotal / total to an invoice directly (the old Studio-save sync matched only exact codes, dropped PPN and rewrote paid invoices).
- **Data Exhibitor.**
  - The API keeps one row per booth (§5), with `mergeGroup` and a per-booth share of the contract (`contractShare`).
  - `ExhibitorTable` and the Dashboard tenant table (`SalesCharts`) show one row per TRANSACTION (`collapseMergedRows`): booths of one auto-merge group and booths of one multi-booth contract (`contractShare.code`, also when they do not touch) become one row "#A-04+A-07+A-08" with summed money (incl. discount) and area. Booth counts (occupancy, categories) keep the per-booth rows.
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
- **Snap ke Booth for booths (sales Studio: `snapToBooths` prop).** In Denah Operasional booths stay locked; there "Snap ke Booth" only makes elements stick to booths (§25).
  - `computeSnap()` works on the real rectangle (AABB after 0/90/180/270° rotation, outer box of a multi-selection). Threshold: `SNAP_SCREEN_PX / zoom`.
  - Per axis: touch (side to side, only when the boxes face each other) or align (same side, any distance). The closest candidate wins; on a tie, touch wins. An axis without a booth candidate falls back to Snap to Grid.
  - Resize snaps the dragged side.
  - Arrow keys move 0,1 m (Shift: 1 m) and stop at a touching booth (`limitStepToTouch`).
  - Alt / Option disables snapping. Copy-by-drag is Ctrl/Cmd only.
  - Booth positions are rounded to 0,01 m on `object:modified`.
  - Overlapping booths are marked red, and a warning is shown after the move.
- **Save route:** `activeOrders` ignores canceled / deleted orders. Otherwise a released booth (unmerge / Lepas Tenant) came back as Reserved on the next Studio save.

---

- **Nama tenant di dalam booth: satu aturan (`utils/boothNameFit.js` `fitTenantName`).**
  - Used by single booths (`layoutTenantName` in `floorplanUtils.js`, called by `layoutBoothInternals` and by the Live page) and by merged groups (`drawGroupLabel` in `boothMerge.js`). Never add a second fitting logic.
  - Area = booth minus header (strip, size, number) and status. The largest font that fits, 1 line or 2 lines for several words (a single word is never cut), horizontal or vertical (rotated 90° counter-clockwise, bottom to top). Vertical only when > 10 % larger. Size between `MIN_NAME_M` (0,25 m) and `maxNameSize()`; below the minimum the name is cut with "…" (`group.__nameTruncated`).
  - The direction is decided from what is seen on the screen (`frameAngle` = booth angle): never upside down, never top to bottom. A rotation re-runs the layout (`object:modified` with action `rotate`, and `updateBoothAppearance` sets the angle before the layout).
  - Size, number, status and the "(Nama Pemilik)" placeholder stay horizontal in the booth's frame.
  - `boothData.nameDirection` ("Arah Nama Tenant": `auto` / `horizontal` / `vertical`) fixes the direction only; it is saved with the canvas, is public (`PUBLIC_BOOTH_FIELDS`) and reaches Denah Operasional (`OPS_BOOTH_FIELDS`). On a merged booth the editor writes it to every member.
  - Text widths and results are cached (`widthCache`, `resultCache`).

---

## 20. Public Data Protection Lock (`utils/publicData.js`)
- **Public view** of `GET /floorplan/active` and `/floorplan/:id` (anonymous visitors, or staff with `?view=public`) goes through `publicFloorplanPayload()`.
  - Canvas boothData is whitelisted: no `picName`, `email`, `phone`, `registeredBy`, or discounts.
  - Internal library elements are dropped.
  - Metadata keeps only event, floorplan, and display (the exported booth list carries discounts).
  - `exhibitor_id` / `boothData.exhibitorId` are replaced by an opaque per-floorplan alias (`PX-…`). Auto-merge only needs equality. The alias salt is `PUBLIC_ALIAS_SALT` (random per process if unset).
  - When adding a field to boothData or booth rows, decide explicitly whether it belongs in `PUBLIC_BOOTH_FIELDS`. Never show PIC, contact, or discount data publicly.
  - Staff booth rows (`boothRowDto` in `floorplanRoutes.js`) carry the tenant biodata saved at registration (`pic_name`, `email`, `phone`, `brand_category`, `registration_source`, `registered_by`) and the private discount, so the Studio's Property Inspector shows a registered tenant as complete instead of "Lengkapi Biodata". The public view strips them (`PUBLIC_BOOTH_ROW_FIELDS`).
- **`GET /orders/check-client`**: visitors receive only `{ exists }`. Contact details are returned to logged-in staff only.
- **`GET /invoices/config`**: visitors never receive the signature image.
- **CORS**: only localhost / 127.0.0.1 (any port) plus the origins listed in `ALLOWED_ORIGINS`.
- **`src/resetDb.js`** (wipes all projects and transactions) runs only with `ALLOW_DB_RESET=yes` and `--confirm-wipe`, never with `NODE_ENV=production`, and always writes `data/backups/pre-reset_*.db` first.
- **Checkout issues the invoice number itself** (never from the form): with `invoice_number UNIQUE`, a number chosen by a visitor could replace an existing, even paid, invoice. Invoices are inserted with plain `INSERT`, never `INSERT OR REPLACE`.
- **Organizer data shown to visitors comes from Setting**, never from client code: bank accounts (`bank1*` / `bank2*`), company name, WhatsApp (`supportWhatsapp`). The primary account is one account: saving Bank 1 in Setting updates the invoice layout fields (`bankName` / `accountNumber` / `accountName` / `bankBranch`) and vice versa (`BANK_FIELD_PAIRS` in `invoiceRoutes.js`); an older difference is never overwritten silently (Setting shows a warning).

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
- **Tests**: `npm test` (root) = `npm run lint` + server tests (`server/test/*.test.js`, `node:test`) + client build.
  - `npm run lint` runs oxlint (client devDependency) with `no-undef` and `react/jsx-no-undef` as errors (`client/.oxlintrc.json`, `server/.oxlintrc.json` for server / shared / ops), so an icon or component used without an import fails the tests. Never turn these rules off.
- **Error boundaries**: the app-wide `ErrorBoundary` is the last resort. Pages with independent parts (the Pengaturan tabs) wrap each part in `SectionErrorBoundary` (`resetKey` = the tab), so one broken tab never takes the header and the other tabs down.
  - Each test file starts its own server on a free port with an empty temporary `DATA_DIR`. Never import server modules (`src/db.js` runs migrations) against `server/data/floorplan.db`.
  - Tests cover login/role access, public booking (draft 404, instant-paid 400, unknown 404, taken 409, no substring matching), contract DP + Pelunasan + discount, auto-merge (one invoice per group, adjacency rules), and public data protection.
  - Never disable or weaken a test to make a change pass.
- **Production starts clean** (`utils/demoCleanup.js`, `db.js`):
  - An empty database is never filled with demo data. `node server/src/seed.js` (demo event `EVT-2026-001` / `FP-2026-001`) is for local demos only.
  - Demo data that was auto-seeded on Railway is removed once at startup, only while untouched (the only floorplan, no invoices, only `ORD-2026-*` orders), after a verified backup. Real data is never deleted by this.
  - First account on production (`RAILWAY_ENVIRONMENT` or `INITIAL_ADMIN_PASSWORD` set): only a Super Admin (`INITIAL_ADMIN_EMAIL`, password `INITIAL_ADMIN_PASSWORD` or a random one printed once in the deploy log). The development accounts (`superadmin123`...) are public in the repository and exist only in development / tests; production logs a warning while one of them is still in use.
  - Locked out: set `RESET_ADMIN_PASSWORD` (min. 8 characters) in the hosting variables and redeploy. On start the Super Admin gets that password (created / re-activated if needed) and its sessions end; the password is never logged. Remove the variable after logging in.
- **Railway storage**: the container disk is discarded on every deploy, so the database must live on a Volume. `db.js` uses `DATA_DIR`, else the attached Volume (`RAILWAY_VOLUME_MOUNT_PATH`), else `server/data`. `storageKind` is `volume` / `ephemeral` (Railway without a Volume: a warning is logged, all data is lost on the next deploy) / `local`.
- **Health**: `GET /api/health` returns `environment` (`APP_ENV`), `version` (package version + git commit / `APP_COMMIT`), `lastBackupAt`, and `storage` (`storageKind`). It never returns secrets.

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

---

## 23. Claude API Key Lock (`utils/claudeApi.js`, `utils/envFile.js`, `ClaudeApiKeySettings.jsx`)
- **Where the key lives.**
  - Only in `server/.env` as `ANTHROPIC_API_KEY`. Never in the database, Git, client code, `VITE_*` variables, logs, audit entries, error reports, or API responses.
  - `utils/envFile.js` loads the file (imported first by `db.js`) and writes it atomically with mode 600. `ENV_FILE` redirects it (tests use their own temporary file).
- **Admin UI (Setting > Integrasi AI (Claude)), Super Admin only.**
  - `/api/maintenance/ai-key` is `access: []`. The Developer role cannot reach it.
  - The key is WRITE-ONLY. `PUT` receives it once. `GET` / responses return only `configured`, `hint` (`…` + last 4 characters), `source`, who changed it and when, and the last check. The input is a password field and is cleared after saving.
  - `PUT` checks the format (`sk-ant-…`, no spaces, quotes, or line breaks, so no `.env` injection), then calls `GET /v1/models` with the key.
  - A 401 / 403 rejects the key and nothing is stored. A network error, 429, or outage saves it with a warning.
  - A key set in the real process environment (`source: 'environment'`) cannot be changed or deleted from the UI.
- **Calling Claude.** Always through `claudeApi.js`: `x-api-key` + `anthropic-version: 2023-06-01`, base URL from `ANTHROPIC_API_URL` (tests point it at a local mock; tests never call the real API).
  - Failures map to Indonesian messages: 401 invalid, 403 forbidden, 429 rate limit, credit balance empty, 5xx outage, network.
  - Never put the key in thrown errors or `console.*`.
- **Audit.** Saving, testing, and deleting are audited (category `Maintenance`) without the value. `SENSITIVE_KEYS` in `audit.js` drops `apiKey` from request details.
- **Staging and tests never receive the production key** (`ANTHROPIC_API_KEY=''` is set by `ops/staging.mjs` and the test harness).


---

## 24. Text Box & Bentuk Lock (`elementLibrary.js` `ShapeBox`, `ShapeStyleSection.jsx`, `ShapeColorPicker.jsx`)
- **Elements** (tab Shapes, Studio and Denah Operasional): `textbox` (in "Teks & Pengukuran"), `shape_rect`, `shape_triangle`, `shape_parallelogram`, `shape_ellipse` (subheading "Bentuk"). They are library elements with `kind: 'shape'`, so they are saved, copied, exported, and listed like the others.
- **One object each: `ShapeBox`** (a Fabric `Textbox`, registered in `classRegistry`). It paints its shape behind the text.
  - The text wraps inside the shape (`SHAPE_TEXT_AREA`), is centred vertically, and is edited in place on the canvas.
  - Per-character colours are Fabric text `styles` and are saved with the object.
  - `boxHeight` (custom property) is the shape height. The object grows only when the text needs more room.
- **Size is real `width` / `boxHeight`, never a scale.**
  - `shapeControls()`: side handles resize one axis, corners resize both axes freely. Shift keeps the proportion; Alt / Option resizes from the centre (also when pressed mid-drag). Minimum `MIN_SHAPE_M` (0,2 m); no flipping.
  - Resize sticks to booth sides (`canvas.__snapShapeResize`, straight elements only). Moving follows Snap to Grid and Snap ke Booth (`snapsToBooths`).
  - `syncShapeElement()` on `object:modified` writes `widthM` / `heightM` / `label` to venueData. A size badge in metres is shown while resizing.
  - Never rebuild a shape with `createLibraryElement`: `rebuildLibraryElement` delegates to `updateShapeElement()` (in place) so text styles and an ongoing edit survive.
- **Colours** live in `venueData.props` (`SHAPE_STYLE_KEYS`):
  - fill colour + opacity or "Tanpa Isi";
  - border colour + opacity, width 0,5–10 px, `solid` / `dashed` / `dotted`, or "Tanpa Border";
  - text colour.
  - `applyShapeStyle()` applies `textColor` to the selected characters while editing with a selection, otherwise to the whole text (clears per-character fills).
  - The editor's `applyShapeStyle(style)` works on every shape in the selection, live, with one undo step per burst.
- **Panel "Warna"** (single element, Studio multi-select, Ops multi-select):
  - The palette includes the booth status colours (`STATUS_CONFIG`), plus a HEX input and the last 8 colours used (`floorplan_recent_colors`, this browser).
  - Salin / Tempel Gaya uses `floorplan_shape_style_clipboard`. "Jadikan Default" saves the style per element type in this browser (`floorplan_shape_defaults`) and is used by `defaultProps()` for new elements.
- No caption overlay for these types (`NO_CAPTION_TYPES`). Backspace / Delete never delete an element while its text is being edited.
- The older "Bentuk & Anotasi Vektor" palette (`ShapePalette`, `isBasicShape`) is separate and unchanged.

---

## 25. Snap ke Elemen Lock (`boothSnap.js`, `CanvasEditor.jsx`)
- **One snap system.** Elements (everything that is not a booth) use the same `computeSnap` / `computeGuides` / `limitStepToTouch` as booths, with the `elements` option. Called without it, every function behaves exactly as booth-to-booth snapping.
  - `server/test/snap.test.js` guards this.
  - A randomized old-vs-new comparison found 0 differences.
  - Never fork a second snap module.
- **Modes in `object:moving`.**
  - A selection that contains a booth uses booth mode (unchanged: booth targets + optional walls, overlap warnings).
  - Anything else uses element mode when "Snap ke Booth" or "Snap ke Elemen" is on. Targets come from `elementSnapTargets()`: booths (Snap ke Booth) and every visible element of every layer, incl. walls, pillars, doors, the ops overlay, and locked sales objects in Denah Operasional (Snap ke Elemen).
  - Targets are computed once per drag (`elementSnapCacheRef`).
- **Order.**
  1. Line elements (`LINE_TYPES`: walls, aisles, VIP lane, wheelchair path, measure, queue): an end snaps to another end or a corner (`snapLineEnds`).
  2. Otherwise sides / corners (touch, align incl. long-distance).
  3. Then, only on an axis without a side candidate, centre to centre or equal spacing (`equalSpacingCandidates`).
  4. Then the grid.
  - Threshold `SNAP_SCREEN_PX / zoom`. Alt / Option disables every snap.
  - Queue line vertices snap to anchor points (`canvas.__snapPoint`). Text Box & Bentuk resize snaps to booth and element sides.
- **Geometry (`snapGeometry`).**
  - Rotated elements use their outer box.
  - Library elements use their body (the hit area = group matrix × child matrix; a CCTV cone does not count).
  - Point-like library elements up to 1 × 1 m (Titik Listrik, WiFi, CCTV...) use their centre (`isPointElement`; shapes are never points).
  - Bulat / Segitiga / Jajaran Genjang use their outer box and centre.
- **Elements may overlap** booths and other elements: no warning and no blocking (the pillar-booth conflict rule stays). Element snapping never changes booths, contracts, or auto-merge adjacency. Element positions are rounded to 0,01 m after a drag.
- **Guides.** Pink = touching / shared point; indigo dashed = aligned; green dashed = centre to centre; orange with the gap in metres = equal spacing. The blue distance label is hidden when a centre / equal guide is shown. Booth overlap marks are off in Denah Operasional (`markBoothOverlaps={false}`).
- **Toolbar ("Grid & Skala").** Toggles: Snap to Grid, Snap ke Booth, Snap ke Elemen (all default on); Snap ke Dinding & Pilar (booth mode, sales only). Denah Operasional shows its own "Snap ke Booth" hint. `CanvasShortcutsGuide` is the "Panduan & Pintasan Kanvas" list in both studios.


---

## 26. Copy Lock: Duplikasi, Ctrl/Cmd + Drag, Ctrl/Cmd + C / V (`utils/copyRules.js`, `CanvasEditor.jsx` `addCopies`)
- **A copy is the original, not a template.**
  - Every copy path serializes the original with `canvas._toObject(obj, 'toObject', COPY_PROPS)` (absolute coordinates, also inside a multi-selection) and deep-copies it (`prepareCopy`).
  - It then revives it with `fabric.util.enlivenObjects` + `hydrateBoothObject` (same as loading a floorplan).
  - Never recreate a copy with `createVenueObject` / `createLibraryElement` / `createBoothObject`. That once turned every library element into a 12 × 6 m dark "Stage" and dropped colours, text styles, flip, and skew.
- **Only identity and position change.**
  - New `venueData.id` / `boothData.id` / `id`. Offset: +1 m (Duplikasi), 0 (the copy left behind by Ctrl/Cmd + drag), the pointer (Ctrl/Cmd + V on the canvas), or +1 m per paste.
  - Links (`anchor`, `anchorOrphaned`, `connections`) are dropped.
  - A booth copy keeps size, category, price, shape, corners, facilities, and rotation. It gets the next free code with the same prefix (`nextBoothCode`), status Available, and no tenant / contract / discount fields (`BOOTH_TENANT_FIELDS`).
  - "Jadikan Default" and templates never apply to copies. The booth hover glow is replaced by the resting shadow.
- **Layers.** The clipboard (`localStorage` `floorplan_canvas_clipboard`) works across floorplans and between Denah Sales and Denah Operasional.
  - `layerMode="ops"`: copies become operational items. Items coming from the sales layer are internal (`publicVisible: false`). Booths are not pasted (a warning is shown).
  - In Sales, `isOpsItem` is removed.
- **Multi-selection copies** keep their relative positions and become the new selection. The copy is placed right above its original (Duplikasi) or right below it (Ctrl/Cmd + drag).
- **Moving never changes an object.** `normalizeScaledObject` only runs on a real resize (scale ≠ 1): a plain move no longer rounds booth sizes to 0,1 m, recomputes venue label fonts, or grows venue shapes by their stroke.
- **Rebuilt elements are selected after the transform** (`selectAfterTransform` in `object:modified`). Selecting them immediately re-ended the transform: resizing a library element or door by its handles produced thousands of copies and a stack overflow.
- Tests: `server/test/copy.test.js`. Browser check: every element type × Duplikasi / copy-paste / Ctrl-drag / move gives an identical serialization except id & position.

---

## 27. Aksi Booth Sales Lock (`boothActionRoutes.js`, `utils/boothDiscount.js`, `SalesBoothActions.jsx`)
- **Pop up.** In the read-only Studio (role Sales) a click on any booth opens `SalesBoothActions`: a popover beside the booth on a wide screen, a bottom sheet below 768 px. It closes with a click outside (capture phase, so a click on another booth switches booths), the X button, or Esc. The open booth is outlined on the canvas (`highlightBoothCode`, drawn in `after:render`, never exported). The layout stays locked.
- **The server decides the buttons** (`actionsFor()` in `GET /api/booth-actions/summary`); the same function guards the POST endpoints, so the pop up and the API never disagree.
  - Available: all three. "Buat Invoice" on a booth without tenant leads to Booking Manual first (`mode: 'booking'`).
  - Reserved: "Buat Invoice" (or "Lihat Invoice" once one exists), "Lihat/Ubah Booking", "Beri Diskon".
  - Sold: only "Lihat Invoice"; the others are disabled with the reason.
  - Maintenance: everything disabled, "Booth sedang maintenance".
- **Booking Manual** = `POST /orders/checkout` with `bookingType: 'booking'` + `deferInvoice: true` (staff only): order + booth Reserved + tenant on the canvas (`applyBoothChangesToCanvas`), **no invoice yet** (`orders.invoice_number = ''`, note in `orders.notes`).
  - An open booking without invoice is never undone by older canceled invoices of the booth: `syncPaymentStatusFromInvoices` (`openBookingWithoutInvoice`) and `POST /floorplan/save` (`contractStateFor`) both skip the "all canceled → available" rule for it.
  - "Lihat/Ubah Booking" = `PUT /orders/update-tenant` (also `notes`).
- **Beri Diskon** = `POST /api/booth-actions/discount`. The form is `BoothDiscountFields` (shared with the Property Inspector); the save is `saveBoothDiscount()` (shared with `POST /invoices/sync-booth-discount`): booth row, `recalcContract`, canvas. Never write a second discount logic.
  - The price comes from the booth row, never from the request. The reason is mandatory for a discount > 0.
  - Sales limit (`readSalesDiscountLimit`, Setting > Aturan Booking): `salesMaxDiscountPercent` (default 10) of the booth price and, when > 0, `salesMaxDiscountAmount` rupiah. Above it: 403 `DISCOUNT_OVER_LIMIT`, nothing is saved (there is no approval queue). Only the Super Admin can change the limit (`POST /invoices/config` keeps the stored values for other roles). Finance / Super Admin are not limited.
- **Buat Invoice** = `POST /api/booth-actions/invoice`: one unpaid `full` invoice from `draftInvoiceRow(booth)` (price − private discount, PPN from Setting for Sales; totals from the form are ignored). The same row is the preview (`invoicePreview.invoice`, shown with `InvoiceA4View isLivePreview`).
  - Refused without a tenant (409 `NEED_BOOKING`) and when the contract already has a live invoice (409 `CONTRACT_HAS_INVOICES` + that invoice, shown as "Lihat Invoice"). The open order gets the invoice number.
  - The issued invoice opens in `InvoiceA4View` (`allowSend`): Download PDF, Print, Kirim WhatsApp. There is no public invoice link (§12, §20).
- **Access.** `/booth-actions/*`: Sales, Finance, Super Admin (`ACCESS_RULES`). Operations: 403 (outside `OPERATIONS_AREA`); visitors: 401.
- **Audit.** Discount and invoice write their own entries (category `Booth`, `req.skipAudit`) with the values before and after in the summary and `details_json`. Booking and tenant edits log "status (tenant) → status · brand" through `AUDIT_RULES` (`boothBefore`).
- **No reload.** Every action returns the fresh summary; `applyServerBooth` repaints that booth (`updateBoothAppearance`). The read-only Studio never saves the canvas: the server writes the same change into `canvas_fabric_json`.
- Tests: `server/test/sales-aksi.test.js`.

---

## 28. Browser Storage & Image Storage Lock (`utils/safeStorage.js`, `utils/localDraft.js`, `utils/storageCleanup.js`, `server/src/utils/uploads.js`)
- **The server is the only source of floorplan data.** Nothing large is mirrored in the browser. `api.saveFloorplan` once copied the whole canvas (with base64 images) into localStorage BEFORE calling the server, without try/catch: a full quota (~5 MB; Safari counts 2 bytes per character) threw "The quota has been exceeded." and the save never reached the server. Never write floorplan / canvas / invoice-layout data to localStorage again.
- **localStorage = small preferences only**: the session, open folders, view modes, toggles, recent colours, shape defaults, the canvas clipboard (max 1 MB, otherwise kept in the tab's memory), the queued "server unreachable" report.
  - New writes go through `safeSet()` (never throws; refuses values above `MAX_LOCAL_VALUE`). A failed storage write must never cancel the action that triggered it.
  - User-facing errors go through `friendlyError()`: a quota error reads "Penyimpanan browser penuh. Data tetap tersimpan di server."
  - `cleanupLegacyStorage()` (in `main.jsx`) removes the old keys (`LEGACY_KEYS`: `floorplan_draft_*`, `published_floorplan_*`, `invoice_template_config`, `registered_exhibitors`) every time the app opens. The old local draft copy is moved to IndexedDB (id `legacy`, 14 days) and is never pushed to the server automatically: an old browser copy must not overwrite newer server data.
- **Unsaved drafts live in IndexedDB** (`localDraft.js`, database `floorplan_local`, at most 5 drafts, 14 days). `api.saveFloorplan` keeps the payload there only when the server could not be reached; a successful save drops it. `offerDraftRestore()` asks once when that floorplan is opened again; restoring only loads the canvas, the next save sends it.
- **Undo / redo**: the last `MAX_HISTORY_STEPS` (20) states, in memory only.
- **Images are files, the database keeps URLs.**
  - `POST /api/uploads { dataUrl }` (Super Admin, Operations, Finance) stores PNG / JPG / WEBP / GIF / SVG up to 15 MB in `DATA_DIR/uploads/<sha256>.<ext>` (on Railway: the Volume) and returns `/api/uploads/<name>`. `GET /api/uploads/<name>` is public (the Live Floorplan shows the blueprint), immutable-cached, `nosniff` + a sandbox CSP (an SVG opened directly cannot run scripts). The name must match `UPLOAD_NAME_RE`.
  - URLs are stored relative (`/api/uploads/...`), so a domain change never breaks them. `externalizeImages()` runs on every `POST /floorplan/save` (canvas, blueprint, metadata) and `POST /invoices/config`: embedded base64 images become files and absolute upload URLs lose their domain, whatever the browser sent.
  - The invoice signature (`CONFIG_INLINE_KEYS`) stays inside the configuration: it is never public (§20).
  - `migrateEmbeddedImages()` runs at every start, after a verified `pre-migration` backup, and rewrites rows that still hold base64 (floorplans, preset layouts, operational elements, invoice configuration). After the first run nothing is left to move.
  - Client: `BlueprintModal` and the invoice logo upload through `api.uploadImage()`; if the upload fails the image is still used and the server stores it at the next save.
  - Development: Vite proxies `/api/uploads` to the API (`client/vite.config.js`). Staging copies `server/data/uploads` next to its database.
  - The database backup (`createBackup`) contains the URLs, not the image files: `DATA_DIR/uploads` must be kept with the Volume.
- Tests: `server/test/uploads.test.js`.

