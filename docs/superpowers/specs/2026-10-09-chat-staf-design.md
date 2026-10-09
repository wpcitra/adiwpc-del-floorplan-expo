# Chat Antar Staf — Desain (2026-10-09)

**Tujuan:** staf (Super Admin, Keuangan, Sales, Operasional, Developer) bisa chat satu sama lain di dalam aplikasi admin, ala WhatsApp: pilih lawan bicara, chat pribadi, grup, tanda dibaca, dan tautan booth / invoice.

**Keputusan pemilik produk**
- Peserta: hanya akun staf (bukan tenant).
- Versi pertama: chat pribadi + grup + centang dibaca + tautan booth/invoice. Tanpa kirim file, edit atau hapus pesan.
- Tampilan: panel melayang dari rail kiri di semua halaman admin.
- Grup dibuat dan diatur hanya oleh Super Admin.
- Privasi: hanya peserta yang bisa membaca; isi pesan tidak masuk Audit Trail.
- Realtime: WebSocket (socket.io). Catatan: tidak bisa dijalankan di Vercel (serverless); butuh server yang berjalan terus (Railway / VPS).

**Arsitektur**
- Data: `chat_conversations`, `chat_members` (`last_read_id`, `last_delivered_id`), `chat_messages` (`attachment_json` = rujukan saja). Dibuat oleh `db.js` saat start.
- Tulis lewat REST `/api/chat/*`; socket hanya mendorong kejadian ke kamar `user:<id>`.
- Kartu lampiran diambil dengan hak akses pembaca (`GET /api/chat/attachment`).

**Pengujian:** `server/test/chat.test.js` (pribadi & realtime, centang, validasi, privasi, grup Super Admin, lampiran sesuai hak akses, socket tanpa token, akun nonaktif) + uji browser dua akun (desktop & HP).

Aturan rinci: AGENTS.md §38.
