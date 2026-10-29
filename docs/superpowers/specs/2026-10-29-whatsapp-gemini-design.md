# Agen Gemini untuk Asisten WhatsApp Staf

Tanggal: 2026-10-29 · Branch: `feat/whatsapp-gemini` · Kunci terkait: AGENTS.md §45 (Asisten WhatsApp), §23 (kunci API)

## Tujuan
Staf (Super Admin, Keuangan, Sales) bisa mengobrol bebas dengan asisten WhatsApp, tanpa menghafal kata perintah. AI-nya
Gemini (Google). Pemilik memilih: agen boleh **membaca data** dan **menyiapkan booking / invoice**; penyimpanan tetap
hanya setelah staf membalas **YA** (sama seperti sekarang). Diskon dan status pembayaran tidak lewat agen.

## Alur pesan (`answerStaff`)
1. Booking yang sedang ditanya satu per satu, lalu YA / BATAL saat ada permintaan menunggu: sistem (tidak berubah).
2. Kata perintah yang dipahami (MENU, TERSEDIA [ukuran], BOOTH <nomor ada>, CARI <≤3 kata>, RINGKASAN, BOOKING <nomor
   ada>, INVOICE <nomor ada>): sistem, tanpa Gemini.
3. Selain itu: Gemini bila aktif (kunci ada + tidak dimatikan); kalau tidak aktif: MENU seperti sekarang. "ya" tanpa
   permintaan menunggu juga ke Gemini bila aktif.

## Agen (`utils/waGemini.js` + alat di `utils/waAgent.js`)
- REST `generateContent` lewat `fetch` (`utils/geminiApi.js`, tanpa SDK). Header `x-goog-api-key`. `GEMINI_API_URL`
  mengarahkan test ke tiruan lokal.
- Alat: `booth_tersedia`, `detail_booth`, `cari_tenant`, `ringkasan_project` (memakai fungsi pembaca yang ada),
  `siapkan_booking`, `siapkan_invoice` (memakai validasi yang sama dengan perintah BOOKING / INVOICE).
- `siapkan_*` berhasil → loop berhenti, **teks konfirmasi buatan sistem** yang dikirim (bukan parafrase Gemini), permintaan
  menunggu YA 10 menit. Gagal / data kurang → pesan kesalahan kembali ke Gemini sebagai data, Gemini bertanya ke staf.
- Aturan peran tetap: Keuangan tidak bisa booking (`CAN_BOOK`).
- Isi balasan model dikembalikan apa adanya dalam satu giliran (thought signature Gemini 3). Maks. 5 langkah alat.
- Ingatan: 12 pesan teks terakhir per staf di RAM, hilang setelah 30 menit tanpa pesan.
- Gagal (kunci ditolak, kuota habis, gangguan) → alasan dalam bahasa Indonesia + "ketik MENU".
- Markdown `**tebal**` diubah ke format WhatsApp `*tebal*`.

## Pengaturan (Setting > Integrasi WhatsApp, kartu "Agen AI (Gemini)", Super Admin)
- `PUT /api/maintenance/whatsapp/gemini { apiKey?, model?, enabled? }`: kunci hanya-tulis di file `.env`
  (`GEMINI_API_KEY`; di Railway `/data/.env`), dicek dulu ke `GET /v1beta/models`: ditolak (kunci salah / tanpa izin) →
  400, tidak disimpan; jaringan / kuota / gangguan → disimpan dengan peringatan. Kunci dari environment asli tidak bisa
  diubah di halaman.
- `GET …/gemini/models`: pilihan model (bisa `generateContent`); default `gemini-3.5-flash` (model tetap; alias `gemini-flash-latest` pernah tidak menjawab 90 detik). Satu panggilan maksimal 30 detik.
- `POST …/gemini/test { question }`: coba tanya dari web, hanya alat baca, tanpa ingatan, tidak tercatat.
- `DELETE …/gemini`: hapus kunci.
- Model & aktif disimpan di `maintenance_settings.wa_meta.gemini`. Status hanya menampilkan 4 huruf terakhir kunci.
- Log Aktivitas (Maintenance) tanpa nilai kunci. Test & staging: `GEMINI_API_KEY=''`, URL mati.
- Catatan privasi di halaman: paket gratis Gemini boleh dipakai Google untuk melatih produk.

## Test (`server/test/whatsapp-gemini.test.js`, Gemini & Fonnte tiruan lokal)
Tanya-jawab dengan alat + ingatan; perintah tetap tanpa Gemini; booking lewat obrolan lalu YA; Keuangan ditolak;
kegagalan Gemini → MENU; pengaturan: hanya-tulis, kunci salah ditolak, nonaktif → MENU, hanya Super Admin, coba tanya
hanya alat baca.
