# 📋 MASTER PRD & ARCHITECTURE BLUEPRINT
## Platform Pemesanan Booth Pameran & Canvas Floorplan Interaktif (Figma-Style)

---

## 1. Ringkasan Sistem & Arsitektur Utama
Sistem ini dirancang menjadi dua sisi utama:
1. **Sisi Admin (EO Dashboard):** Alat bagi Event Organizer untuk menggambar layout pameran, mengatur harga, dan memantau analitik keuangan serta daftar *exhibitor*.
2. **Sisi Publik (Exhibitor Portal):** Portal mandiri bagi peserta pameran untuk melihat denah interaktif secara *real-time*, memilih booth, dan melakukan pembayaran instan.

---

## 2. Rincian Fitur Lengkap (Admin & Publik)

### 🛠️ A. Sisi Admin (Event Organizer)
*   **Canvas Editor (Figma-Style Builder):** 
    * *Drag-and-Drop & Shape Tools:* Membuat bentuk booth (Standar, Island, VIP) dan fasilitas venue (panggung, tiang, toilet).
    * *Multi-Select, Grouping, & Snap-to-Grid:* Mempermudah penataan massal secara presisi.
    * *Import Blueprint:* Mengunggah file PDF/Gambar denah asli sebagai latar belakang transparan acuan menggambar.
*   **Property Inspector Panel:** Mengatur kode booth (misal: `A-01`), kategori, fasilitas, harga sewa, dan status manual.
*   **Analytics & Reports (Visual Dashboards):**
    * *Revenue Chart* (Bar/Line Chart untuk memantau tren pendapatan).
    * *Occupancy Pie Chart* (Persentase status booth: Terjual, Pending, Tersedia).
*   **Exhibitor Directory (Tenant Management):** Tabel terpusat nama perusahaan, kontak PIC, status pembayaran, tombol kirim reminder WhatsApp, dan fitur *Export Excel/PDF*.

### 🌐 B. Sisi Publik (Calon Tenant)
*   **Interactive Floorplan:** Peta denah interaktif berbasis kode warna status *real-time* (Hijau = Tersedia, Kuning = Pending, Merah = Sold).
*   **Booth Preview & Details:** Popup informasi ukuran, harga, fasilitas, dan foto referensi saat booth diklik.
*   **Multi-Booth Cart & Auto-Lock Timer:** Memilih beberapa booth sekaligus dan menguncinya secara otomatis (*temporary lock* selama 10–15 menit) untuk mencegah *double booking*.
*   **Checkout & Payment Gateway:** Formulir data perusahaan dan integrasi pembayaran instan (Midtrans/Xendit) dengan pengiriman *invoice* otomatis.

---

## 3. Rancangan Skema Database (Relational SQL + JSON)

*   **Tabel `users`:** Menyimpan akun Admin/EO dan Exhibitor (`id`, `name`, `email`, `role`).
*   **Tabel `events`:** Data master pameran (`id`, `title`, `start_date`, `end_date`, `status`).
*   **Tabel `floorplans`:** Peta denah per event (`id`, `event_id`, `title`, `canvas_data` [JSON untuk konfigurasi global]).
*   **Tabel `booths`:** Unit booth individual (`id`, `floorplan_id`, `booth_number`, `category`, `price`, `status`, `coordinates` [JSON posisi X, Y, width, height, rotasi untuk Fabric.js], `facilities`).
*   **Tabel `orders`:** Transaksi pemesanan (`id`, `exhibitor_id`, `event_id`, `total_amount`, `status`, `payment_ref`, `expires_at`).
*   **Tabel `order_items`:** Hubungan transaksi ke booth yang dibeli (mendukung *multi-booth cart*).

---

## 4. Struktur Direktori Proyek (Project Folder Structure)

```text
exhibition-floorplan-platform/
│
├── client/ (Frontend - Next.js / React & Tailwind CSS)
│   ├── public/
│   │   └── assets/                  # Gambar, logo, blueprint latar belakang
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   ├── CanvasEditor.jsx    # Editor kanvas utama (Fabric.js wrapper)
│   │   │   │   ├── PropertyPanel.jsx   # Panel pengatur detail booth yang diklik
│   │   │   │   ├── SalesCharts.jsx     # Komponen grafik analitik & pie chart
│   │   │   │   └── ExhibitorTable.jsx  # Tabel manajemen data tenant & export
│   │   │   └── public/
│   │   │       ├── LiveFloorplan.jsx   # Teta interaktif untuk publik
│   │   │       ├── BoothModal.jsx      # Popup detail & tombol pilih booth
│   │   │       └── CartDrawer.jsx      # Keranjang belanja & timer auto-lock
│   │   ├── hooks/                      # Custom hooks (useCanvas, useAutoLock)
│   │   ├── store/                      # Global state management (Zustand / Redux)
│   │   └── pages/app/                  # Routing halaman admin & publik
│   ├── package.json
│   └── tailwind.config.js
│
├── server/ (Backend - Node.js & Express / NestJS)
│   ├── src/
│   │   ├── config/                     # Konfigurasi Database (PostgreSQL) & Redis
│   │   ├── controllers/                # Logika bisnis (Booth, Event, Order)
│   │   ├── models/                     # Skema ORM / Database models
│   │   ├── routes/                     # API Endpoints (RESTful API)
│   │   ├── services/                   # Layanan pihak ketiga (Payment Gateway, WA API)
│   │   └── utils/                      # Helper & fungsi keamanan (JWT, Auto-lock cron)
│   ├── package.json
│   └── .env                            # Environment variables (Database URL, API Keys)
│
└── README.md