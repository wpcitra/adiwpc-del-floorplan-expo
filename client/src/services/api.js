import { apiFetch } from './session';

// API address per environment (client/.env: VITE_API_URL); production on this computer uses port 5001
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export const api = {
  // 1. Fetch active floorplan from SQLite database with multi-hall support
  async fetchActiveFloorplan(params = {}) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await apiFetch(`${API_BASE_URL}/floorplan/active?_t=${Date.now()}${qs ? `&${qs}` : ''}`, {
        // No custom Pragma/Cache-Control headers: the API's CORS config rejects them (cache: 'no-store' + _t already bust caches)
        cache: 'no-store'
      });
      if (res.status === 404) {
        try {
          localStorage.removeItem('published_floorplan_fabric');
          localStorage.removeItem('published_floorplan_data');
          localStorage.removeItem('floorplan_draft_fabric');
          localStorage.removeItem('floorplan_draft_data');
        } catch (storageErr) {}
        return null;
      }
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.floorplan) {
          // Mirror active floorplan to local storage cache
          try {
            if (json.floorplan.canvas_fabric_json) {
              localStorage.setItem('published_floorplan_fabric', JSON.stringify(json.floorplan.canvas_fabric_json));
            }
            if (json.floorplan.metadata) {
              localStorage.setItem('published_floorplan_data', JSON.stringify(json.floorplan.metadata));
            }
          } catch (storageErr) {}
          return {
            ...json.floorplan,
            event: json.event,
            halls: json.halls || []
          };
        }
      }
    } catch (e) {
      console.warn("Backend server offline, using local storage fallback", e);
      const savedFabric = localStorage.getItem('published_floorplan_fabric') || localStorage.getItem('floorplan_draft_fabric');
      const savedData = localStorage.getItem('published_floorplan_data') || localStorage.getItem('floorplan_draft_data');
      if (savedFabric || savedData) {
        return {
          canvas_fabric_json: savedFabric ? JSON.parse(savedFabric) : null,
          metadata: savedData ? JSON.parse(savedData) : null
        };
      }
    }
    
    return null;
  },

  // 1b. Fetch all Events/Projects with their child Halls
  // params.view = 'public' -> only published floorplans (what the Live Denah portal may show)
  async fetchEvents(params = {}) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await apiFetch(`${API_BASE_URL}/floorplan/events?_t=${Date.now()}${qs ? `&${qs}` : ''}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return json.events || [];
        }
      }
    } catch (e) {
      console.warn("Failed to fetch events list:", e);
    }
    return [];
  },

  // 1c. Create a new Hall for an existing Event
  async createHall(payload) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/create-hall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Gagal membuat hall baru' };
    }
  },

  // 2. Fetch all saved floorplan templates
  async fetchFloorplanList(params = {}) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await apiFetch(`${API_BASE_URL}/floorplan/list?_t=${Date.now()}${qs ? `&${qs}` : ''}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return json.floorplans || [];
        }
      }
    } catch (e) {
      console.warn("Failed to fetch floorplan templates list:", e);
    }
    return [];
  },

  // 3. Fetch specific floorplan by ID
  async fetchFloorplanById(id, params = {}) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await apiFetch(`${API_BASE_URL}/floorplan/${id}?_t=${Date.now()}${qs ? `&${qs}` : ''}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.floorplan) {
          return {
            ...json.floorplan,
            event: json.event,
            halls: json.halls || []
          };
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch floorplan ${id}:`, e);
    }
    return null;
  },

  // 4b. Stop publishing a floorplan (back to draft; its /live/<slug> link stops working)
  // Auto-merge: "Tampilkan Terpisah" / "Gabungkan Kembali" for one merged booth group
  async setMergeDisplay(floorplanId, boothCodes, separate) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/${encodeURIComponent(floorplanId)}/merge-display`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothCodes, separate })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async unpublishFloorplan(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/${id}/unpublish`, { method: 'POST' });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Koneksi server gagal' };
    }
  },

  // 4. Publish a specific floorplan template
  async publishFloorplan(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/${id}/publish`, {
        method: 'POST'
      });
      if (res.ok) {
        const json = await res.json();
        // Immediately refresh active floorplan in localStorage cache
        try {
          const activeRes = await apiFetch(`${API_BASE_URL}/floorplan/active?_t=${Date.now()}`, { cache: 'no-store' });
          if (activeRes.ok) {
            const activeData = await activeRes.json();
            if (activeData.success && activeData.floorplan) {
              if (activeData.floorplan.canvas_fabric_json) {
                localStorage.setItem('published_floorplan_fabric', JSON.stringify(activeData.floorplan.canvas_fabric_json));
              }
              if (activeData.floorplan.metadata) {
                localStorage.setItem('published_floorplan_data', JSON.stringify(activeData.floorplan.metadata));
              }
            }
          }
        } catch (syncErr) {}
        return json;
      }
      // e.g. 403 for a role that may not publish: pass the server's reason on
      return await res.json().catch(() => ({ success: false, error: `Gagal mempublikasikan (HTTP ${res.status})` }));
    } catch (e) {
      console.warn(`Failed to publish floorplan ${id}:`, e);
    }
    return { success: false, error: 'Koneksi server gagal' };
  },

  // 5. Duplicate a template
  async duplicateFloorplan(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/${id}/duplicate`, {
        method: 'POST'
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Failed to duplicate floorplan ${id}:`, e);
    }
    return { success: false, error: 'Koneksi server gagal' };
  },

  // 6. Delete a template
  async deleteFloorplan(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Failed to delete floorplan ${id}:`, e);
    }
    return { success: false, error: 'Koneksi server gagal' };
  },

  // 7. Save Draft or Publish Floorplan to SQLite database
  async saveFloorplan(data) {
    // Mirror to localStorage for quick fallback
    if (data.fabricJson) {
      localStorage.setItem('floorplan_draft_fabric', JSON.stringify(data.fabricJson));
      if (data.status === 'published') {
        localStorage.setItem('published_floorplan_fabric', JSON.stringify(data.fabricJson));
      }
    }
    if (data.metadata) {
      localStorage.setItem('floorplan_draft_data', JSON.stringify(data.metadata));
      if (data.status === 'published') {
        localStorage.setItem('published_floorplan_data', JSON.stringify(data.metadata));
      }
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json;
      // Session expired, no permission or server error: the change is NOT in the database
      return { success: false, status: res.status, error: json.error || `Server menolak penyimpanan (HTTP ${res.status})` };
    } catch (e) {
      console.warn("Server save failed, draft kept in localStorage only:", e);
      return { success: false, localOnly: true, error: 'Tidak dapat terhubung ke server' };
    }
  },

  // 8. Process Exhibitor Order & Checkout in SQLite database
  async checkoutOrder(orderData) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/orders/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });
      // Refusals (booth just booked by someone else, not found, ...) must reach the page: never fake a success
      return await res.json();
    } catch (e) {
      console.warn("checkoutOrder error:", e);
      return { success: false, error: 'Server tidak dapat dihubungi. Pemesanan belum tersimpan, silakan coba lagi.' };
    }
  },

  // 8b. Fetch list of all registered clients for selector & deduplication
  async fetchRegisteredClients() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/orders/registered-clients`);
      if (res.ok) {
        const json = await res.json();
        return json.clients || [];
      }
    } catch (e) {
      console.warn("Failed to fetch registered clients:", e);
    }
    return [];
  },

  // 8c. Check if email or phone is already registered
  async checkExistingExhibitor({ email, phone }) {
    try {
      const params = new URLSearchParams();
      if (email) params.append('email', email);
      if (phone) params.append('phone', phone);
      const res = await apiFetch(`${API_BASE_URL}/orders/check-client?${params.toString()}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("Failed to check existing exhibitor:", e);
    }
    return { success: false, exists: false };
  },

  // 8d. Detach tenant from booth
  async detachTenantFromBooth(data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/orders/detach-tenant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      console.error("Failed to detach tenant:", e);
      return { success: false, error: e.message };
    }
  },

  // 8e. Update tenant biodata
  async updateTenantBiodata(data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/orders/update-tenant`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      console.error("Failed to update tenant biodata:", e);
      return { success: false, error: e.message };
    }
  },

  // 9. Fetch All Exhibitors & Transactions (Brand / Tenant Booked Booths) with optional project filter
  async fetchExhibitors(floorplanId) {
    try {
      const query = floorplanId && floorplanId !== 'all' ? `?floorplanId=${encodeURIComponent(floorplanId)}` : '';
      const res = await apiFetch(`${API_BASE_URL}/exhibitors${query}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.exhibitors) {
          return {
            exhibitors: json.exhibitors || [],
            projectsList: json.projectsList || [],
            selectedProjectId: json.selectedProjectId || 'all'
          };
        }
      }
    } catch (e) {
      console.warn("Failed to fetch exhibitors from server", e);
    }

    const registered = localStorage.getItem('registered_exhibitors');
    let list = registered ? JSON.parse(registered) : [];

    // Parse local fabric objects to extract all booths with tenant brand names
    try {
      const savedFabricStr = localStorage.getItem('published_floorplan_fabric') || localStorage.getItem('floorplan_draft_fabric');
      if (savedFabricStr) {
        const fabric = JSON.parse(savedFabricStr);
        if (fabric.objects) {
          const existingCodes = new Set(list.map(e => e.booth));
          fabric.objects.forEach(obj => {
            const booth = obj.boothData;
            if (booth && (booth.status === 'SOLD' || booth.status === 'RESERVED' || booth.status === 'sold' || booth.status === 'reserved')) {
              if (booth.ownerName && !existingCodes.has(booth.code)) {
                list.push({
                  id: `local-${booth.id || booth.code}`,
                  company: booth.ownerName, // Brand / Tenant Name
                  pic: booth.ownerName,
                  email: '-',
                  contact: '-',
                  booth: booth.code,
                  category: booth.category || 'Standard',
                  price: booth.price || 5000000,
                  status: booth.status.toLowerCase() === 'sold' ? 'sold' : 'reserved',
                  date: new Date().toLocaleDateString('id-ID')
                });
              }
            }
          });
        }
      }
    } catch (err) {
      console.warn("Local exhibitor fallback parse error:", err);
    }

    return {
      exhibitors: list,
      projectsList: [],
      selectedProjectId: 'all'
    };
  },

  // 10. Fetch Dashboard Summary Stats with optional floorplanId
  async fetchStats(floorplanId) {
    try {
      const query = floorplanId ? `?floorplanId=${encodeURIComponent(floorplanId)}` : '';
      const res = await apiFetch(`${API_BASE_URL}/stats${query}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return {
            ...json.stats,
            floorplanList: json.floorplanList || [],
            exhibitorsList: json.exhibitorsList || [],
            categoryBreakdown: json.categoryBreakdown || [],
            selectedProjectId: json.selectedProjectId || 'all',
            selectedProject: json.selectedProject || null
          };
        }
      }
    } catch (e) {
      console.warn("Failed to fetch stats from server", e);
    }

    return null;
  },

  // 10.1 Update Booth Status and Tenant Name
  async updateBoothStatus(boothId, { status, owner_name }) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/stats/booth/${boothId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, owner_name })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error("Failed to update booth status:", e);
    }
    return { success: false, error: 'Gagal menghubungi server' };
  },

  // 11. Reseed database with dummy data
  async reseedDatabase() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/seed`, { method: 'POST' });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("Failed to reseed database:", e);
    }
    return { success: false };
  },

  // 12. Fetch all invoices
  async fetchInvoices(params = {}) {
    try {
      const query = new URLSearchParams(params).toString();
      const url = `${API_BASE_URL}/invoices${query ? `?${query}` : ''}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return json.invoices || [];
        }
      }
    } catch (e) {
      console.warn("Failed to fetch invoices:", e);
    }
    return [];
  },

  // 13. Fetch single invoice by ID
  async fetchInvoiceById(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/invoices/${id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.invoice) {
          return json.invoice;
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch invoice ${id}:`, e);
    }
    return null;
  },

  // 14. Create a new invoice
  async createInvoice(invoiceData) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData)
      });
      // Validation errors (e.g. DP already exists, DP not paid yet) carry a message & code from the server
      return await res.json();
    } catch (e) {
      console.warn("Failed to create invoice:", e);
    }
    return { success: false, error: 'Koneksi server gagal' };
  },

  // 14b. Booth contract summary (Total Kontrak, Sudah Ditagih / Dibayar, DP & Pelunasan) for the invoice wizard
  async fetchContract({ floorplanId, boothCode = '', boothId = '', taxRate = 0 }) {
    try {
      const qs = new URLSearchParams({ floorplanId, boothCode, boothId, taxRate: String(taxRate), _t: String(Date.now()) });
      const res = await apiFetch(`${API_BASE_URL}/invoices/contract?${qs}`, { cache: 'no-store' });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Koneksi server gagal' };
    }
  },

  // 15. Update an invoice
  async updateInvoice(id, invoiceData) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Failed to update invoice ${id}:`, e);
    }
    return { success: false, error: 'Koneksi server gagal' };
  },

  // 16. Update invoice payment status and booth status
  async updateInvoiceStatus(id, status, boothStatus = null, paidAmount = undefined, remainingAmount = undefined, extra = {}) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/invoices/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, boothStatus, paidAmount, remainingAmount, ...extra })
      });
      return await res.json();
    } catch (e) {
      console.warn(`Failed to update status for invoice ${id}:`, e);
    }
    return { success: false, error: 'Koneksi server gagal' };
  },

  // 17. Delete an invoice
  async deleteInvoice(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/invoices/${id}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (e) {
      console.warn(`Failed to delete invoice ${id}:`, e);
    }
    return { success: false, error: 'Koneksi server gagal' };
  },

  // 18. Fetch Invoice Layout Template Configuration
  async fetchInvoiceConfig() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/invoices/config`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.config) {
          localStorage.setItem('invoice_template_config', JSON.stringify(json.config));
          return json.config;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch invoice config from server:", e);
    }

    const localSaved = localStorage.getItem('invoice_template_config');
    return localSaved ? JSON.parse(localSaved) : null;
  },

  // 19. Save Invoice Layout Template Configuration
  async saveInvoiceConfig(config) {
    localStorage.setItem('invoice_template_config', JSON.stringify(config));
    try {
      const res = await apiFetch(`${API_BASE_URL}/invoices/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.config) {
          localStorage.setItem('invoice_template_config', JSON.stringify(json.config));
        }
        return json;
      }
    } catch (e) {
      console.warn("Saved config locally (server sync error):", e);
    }
    return { success: true, localOnly: true, config };
  },

  // 20. Fetch All Booth Categories
  async fetchCategories() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.categories)) {
          return json.categories;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch categories from server:", e);
    }
    return null;
  },

  // 21. Create New Booth Category Tier
  async createCategory(data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 22. Update Existing Booth Category Tier
  async updateCategory(id, data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 23. Delete Booth Category Tier
  async deleteCategory(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 24. Reset Booth Categories to Defaults
  async resetCategories() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories/reset`, {
        method: 'POST'
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 25. Fetch Brand Categories (with optional projectId filter)
  async fetchBrandCategories(activeOnly = false, projectId = null) {
    try {
      const params = new URLSearchParams();
      if (activeOnly) params.append('activeOnly', 'true');
      if (projectId) params.append('projectId', projectId);
      const query = params.toString() ? `?${params.toString()}` : '';

      const res = await apiFetch(`${API_BASE_URL}/brand-categories${query}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.categories)) {
          return json.categories;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch brand categories from server:", e);
    }
    // Fallback default list
    return [
      { id: 'bcat_1', name: 'Fashion & Apparel', isActive: true, sortOrder: 1 },
      { id: 'bcat_2', name: 'Kuliner & F&B', isActive: true, sortOrder: 2 },
      { id: 'bcat_3', name: 'Travel & Tourism', isActive: true, sortOrder: 3 },
      { id: 'bcat_4', name: 'Education & Academy', isActive: true, sortOrder: 4 },
      { id: 'bcat_5', name: 'Teknologi & Gadget', isActive: true, sortOrder: 5 },
      { id: 'bcat_6', name: 'Kesehatan & Beauty', isActive: true, sortOrder: 6 },
      { id: 'bcat_7', name: 'Otomotif & Aksesoris', isActive: true, sortOrder: 7 },
      { id: 'bcat_8', name: 'Properti & Interior', isActive: true, sortOrder: 8 },
      { id: 'bcat_9', name: 'Kerajinan & Craft', isActive: true, sortOrder: 9 },
      { id: 'bcat_10', name: 'Lainnya', isActive: true, sortOrder: 10 }
    ];
  },

  // 26. Create Brand Category (supports projectId)
  async createBrandCategory(data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/brand-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // Copy default brand categories to specific project
  async copyDefaultBrandCategories(targetProjectId) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/brand-categories/copy-default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetProjectId })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // Save & isolate brand categories for a specific project
  async saveProjectBrandCategories(projectId, categories = null) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/brand-categories/save-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, categories })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 27. Update Brand Category (name or isActive)
  async updateBrandCategory(id, data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/brand-categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 28. Delete Brand Category
  async deleteBrandCategory(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/brand-categories/${id}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 29. Fetch All Payment Methods
  async fetchPaymentMethods(activeOnly = false) {
    try {
      const query = activeOnly ? '?activeOnly=true' : '';
      const res = await apiFetch(`${API_BASE_URL}/payment-methods${query}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.paymentMethods)) {
          return json.paymentMethods;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch payment methods from server:", e);
    }
    // Default fallback
    return [
      { id: 'pm_qris', key: 'qris', name: 'QRIS Instan', description: 'GoPay, OVO, Dana, Shopee, BCA QR', iconType: 'qris', isActive: true, sortOrder: 1 },
      { id: 'pm_bca_va', key: 'bca_va', name: 'BCA Virtual Account', description: 'Verifikasi Otomatis Bank BCA', iconType: 'bank', isActive: true, sortOrder: 2 },
      { id: 'pm_mandiri_va', key: 'mandiri_va', name: 'Mandiri / BNI VA', description: 'Virtual Account Bank Mandiri / BNI', iconType: 'bank', isActive: true, sortOrder: 3 },
      { id: 'pm_cc', key: 'cc', name: 'Kartu Kredit / Debit', description: 'Visa, Mastercard, JCB', iconType: 'card', isActive: true, sortOrder: 4 }
    ];
  },

  // 30. Create Payment Method
  async createPaymentMethod(data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/payment-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 31. Update Payment Method
  async updatePaymentMethod(id, data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/payment-methods/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 32. Delete Payment Method
  async deletePaymentMethod(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/payment-methods/${id}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 33. Fetch Preset Layouts
  async fetchPresetLayouts() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/presets`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.presets)) {
          return json.presets;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch preset layouts from server:", e);
    }
    return [];
  },

  // 34. Save Floorplan as Preset Layout
  async saveFloorplanAsPreset(data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/save-as-preset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 35. Delete Preset Layout
  async deletePresetLayout(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/presets/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 36. Fetch Facility Request Forms & Templates
  async fetchFacilityForms(params = {}) {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await apiFetch(`${API_BASE_URL}/facilities/forms${query ? `?${query}` : ''}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.forms || [];
      }
    } catch (e) {
      console.warn("Failed to fetch facility forms:", e);
    }
    return [];
  },

  // 37. Fetch Single Facility Form by ID
  async fetchFacilityFormById(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/facilities/forms/${id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.form;
      }
    } catch (e) {
      console.warn(`Failed to fetch facility form ${id}:`, e);
    }
    return null;
  },

  // 38. Save Facility Form or Template
  async saveFacilityForm(data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/facilities/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 39. Delete Facility Form
  async deleteFacilityForm(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/facilities/forms/${id}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 40. Fetch Tenant Facility Requests
  async fetchFacilityRequests(params = {}) {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await apiFetch(`${API_BASE_URL}/facilities/requests${query ? `?${query}` : ''}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.requests || [];
      }
    } catch (e) {
      console.warn("Failed to fetch facility requests:", e);
    }
    return [];
  },

  // 41. Submit Facility Request (Public Tenant Portal)
  async submitFacilityRequest(data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/facilities/requests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 42. Update Facility Request Status
  async updateFacilityRequestStatus(id, status) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/facilities/requests/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 43. Generate Official A4 Invoice for Facility Request
  async generateFacilityInvoice(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/facilities/requests/${id}/generate-invoice`, {
        method: 'POST'
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 44. Save & Sync Booth Discount directly to Invoices
  async syncBoothDiscount(payload) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/invoices/sync-booth-discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Koneksi server gagal' };
    }
  },

  // 45. Fetch soft-deleted projects in Trash
  async fetchTrashProjects() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/trash?_t=${Date.now()}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        return json.trash || [];
      }
      return [];
    } catch (e) {
      console.error("fetchTrashProjects error:", e);
      return [];
    }
  },

  // 46. Soft delete projects
  async softDeleteProjects(projectIds, reason = 'Dihapus oleh admin', deletedBy = 'Admin') {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/soft-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds, reason, deletedBy })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Gagal memindahkan ke sampah' };
    }
  },

  // 47. Restore soft-deleted projects
  async restoreProjects(projectIds, restoredBy = 'Admin') {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds, restoredBy })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Gagal memulihkan project' };
    }
  },

  // 48. Permanently delete projects (financial safety locked)
  async permanentDeleteProjects(projectIds, confirmedBy = 'Admin') {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/permanent-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds, confirmedBy })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Gagal menghapus permanen' };
    }
  },

  // 49. Fetch Activity Logs
  async fetchActivityLogs(limit = 100) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/floorplan/activity-logs?limit=${limit}&_t=${Date.now()}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        return json.logs || [];
      }
      return [];
    } catch (e) {
      console.error("fetchActivityLogs error:", e);
      return [];
    }
  },

  // Auth: login / logout / current session / change own password
  async login(email, password) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Tidak dapat terhubung ke server' };
    }
  },

  async logout() {
    try {
      await apiFetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' });
    } catch (e) {}
  },

  async fetchCurrentUser() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/me`, { cache: 'no-store' });
      const json = await res.json();
      return json.success ? json.user : null;
    } catch (e) {
      return undefined; // server unreachable: keep the local session
    }
  },

  async changePassword(currentPassword, newPassword) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Tidak dapat terhubung ke server' };
    }
  },

  // Audit trail (Super Admin)
  // ---- Denah Operasional (operational layer on top of the sales floorplan) ----
  async fetchOpsFloorplans() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/ops/floorplans?_t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      return json.success ? json.floorplans : [];
    } catch (e) {
      console.error('fetchOpsFloorplans error:', e);
      return [];
    }
  },

  async fetchOpsLayer(floorplanId, params = {}) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await apiFetch(`${API_BASE_URL}/ops/${encodeURIComponent(floorplanId)}?_t=${Date.now()}${qs ? `&${qs}` : ''}`, { cache: 'no-store' });
      return await res.json();
    } catch (e) {
      console.error('fetchOpsLayer error:', e);
      return { success: false, error: e.message };
    }
  },

  async fetchOpsVersion(floorplanId) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/ops/${encodeURIComponent(floorplanId)}/version?_t=${Date.now()}`, { cache: 'no-store' });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async saveOpsLayer(floorplanId, payload) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/ops/${encodeURIComponent(floorplanId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      return { ...json, status: res.status };
    } catch (e) {
      console.error('saveOpsLayer error:', e);
      return { success: false, error: e.message };
    }
  },

  async copyOpsLayer(targetFloorplanId, sourceId) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/ops/${encodeURIComponent(targetFloorplanId)}/copy-from`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async fetchPublicOpsElements(floorplanId) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/ops/${encodeURIComponent(floorplanId)}/public?_t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      return json.success ? json.elements : [];
    } catch (e) {
      return [];
    }
  },

  // ---- In-app notifications ----
  async fetchNotifications() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/notifications?_t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      return json.success ? json : { notifications: [], unreadCount: 0 };
    } catch (e) {
      return { notifications: [], unreadCount: 0 };
    }
  },

  async markNotificationRead(id) {
    try {
      await apiFetch(`${API_BASE_URL}/notifications/${id}/read`, { method: 'POST' });
    } catch (e) {}
  },

  async markAllNotificationsRead() {
    try {
      await apiFetch(`${API_BASE_URL}/notifications/read-all`, { method: 'POST' });
    } catch (e) {}
  },

  async fetchAuditLogs(params = {}) {
    try {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')).toString();
      const res = await apiFetch(`${API_BASE_URL}/audit-logs?${qs}&_t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      return json.success ? json : { logs: [], categories: [] };
    } catch (e) {
      console.error("fetchAuditLogs error:", e);
      return { logs: [], categories: [] };
    }
  },

  // Pusat Maintenance (AGENTS.md §22)
  async fetchMaintenanceErrors(params = {}) {
    try {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')).toString();
      const res = await apiFetch(`${API_BASE_URL}/maintenance/errors?${qs}&_t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      return json.success ? json : { errors: [], summary: null, error: json.error };
    } catch (e) {
      return { errors: [], summary: null, error: 'Server tidak dapat dihubungi' };
    }
  },

  async fetchMaintenanceError(id) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/maintenance/errors/${encodeURIComponent(id)}?_t=${Date.now()}`, { cache: 'no-store' });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Server tidak dapat dihubungi' };
    }
  },

  async setMaintenanceErrorStatus(id, status, note = '') {
    try {
      const res = await apiFetch(`${API_BASE_URL}/maintenance/errors/${encodeURIComponent(id)}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Server tidak dapat dihubungi' };
    }
  },

  // Claude API key (Super Admin, write-only: only the status comes back, never the key)
  async fetchClaudeKeyStatus() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/maintenance/ai-key?_t=${Date.now()}`, { cache: 'no-store' });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Server tidak dapat dihubungi' };
    }
  },

  async saveClaudeKey(apiKey) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/maintenance/ai-key`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Server tidak dapat dihubungi' };
    }
  },

  async testClaudeKey() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/maintenance/ai-key/test`, { method: 'POST' });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Server tidak dapat dihubungi' };
    }
  },

  async deleteClaudeKey() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/maintenance/ai-key`, { method: 'DELETE' });
      return await res.json();
    } catch (e) {
      return { success: false, error: 'Server tidak dapat dihubungi' };
    }
  },

  // 50. Fetch Users (Super Admin, Keuangan, Sales)
  async fetchUsers() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/users?_t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      return json.success ? json.users : [];
    } catch (e) {
      console.error("fetchUsers error:", e);
      return [];
    }
  },

  // 51. Create User
  async createUser(data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Gagal menambahkan user' };
    }
  },

  // 52. Update User (password only changes when provided)
  async updateUser(id, data) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message || 'Gagal memperbarui user' };
    }
  }
};

export default api;

