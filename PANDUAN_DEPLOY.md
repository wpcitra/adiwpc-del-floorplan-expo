# Panduan Lengkap Deploy Website Expo Floorplan ke VPS (Ubuntu)

Panduan ini disusun secara berurutan langkah demi langkah dari awal (komputer lokal) hingga website aktif online dengan domain dan HTTPS (SSL gratis).

---

## 📋 Ringkasan Arsitektur
- **Frontend**: React 19 + Vite (dibuat file statis HTML/CSS/JS via `npm run build`).
- **Backend API**: Node.js + Express (berjalan di background menggunakan **PM2** pada port `5001`).
- **Database**: SQLite 3 (`server/data/floorplan.db`).
- **Web Server / Reverse Proxy**: **Nginx** (meneruskan trafik port 80/443 ke frontend & backend).
- **Keamanan**: SSL gratis dari **Certbot (Let's Encrypt)**.

---

## FASE 1: Persiapan di Komputer Lokal

### 1.1 Pastikan Semua Perubahan Tersimpan di Git
Buka Terminal di komputer lokal Anda:
```bash
cd /Users/macbook/Desktop/Floorplan
git status
```
Jika ada perubahan yang belum di-commit:
```bash
git add .
git commit -m "Siap deploy ke production"
```

### 1.2 Push ke GitHub / GitLab
Buat repository baru di GitHub (misal: `floorplan-expo`), lalu hubungkan:
```bash
# Ganti dengan URL repository GitHub Anda
git remote add origin https://github.com/username-anda/floorplan-expo.git
git branch -M main
git push -u origin main
```

---

## FASE 2: Persiapan Server VPS & Domain

### 2.1 Beli Server VPS
Pilih penyedia VPS mana pun dengan spesifikasi minimal:
- **Spesifikasi Rekomendasi**: 1 vCPU, 2 GB RAM (atau 1 GB RAM + 2 GB Swap), Disk SSD 25 GB.
- **Sistem Operasi**: **Ubuntu 22.04 LTS** atau **Ubuntu 24.04 LTS**.
- **Rekomendasi Provider**:
  - Global: DigitalOcean (Droplet $6/bln), Hetzner (€4/bln), Linode.
  - Lokal Indonesia: IDCloudHost, Niagahoster, Biznet Gio.

### 2.2 Hubungkan Domain ke IP VPS (DNS Record)
Buka panel kontrol domain Anda (Cloudflare, Niagahoster, Rumahweb, dll.), lalu buat **DNS A Record**:
- **Type**: `A`
- **Name / Host**: `@` (atau subdomain misal `denah`)
- **Value / Target IP**: `IP_ADDRESS_VPS_ANDA`
- *(Opsional)* **Type**: `A`, **Name**: `www`, **Value**: `IP_ADDRESS_VPS_ANDA`

---

## FASE 3: Konfigurasi Awal Server VPS

### 3.1 Masuk ke VPS melalui SSH
Di terminal laptop Anda, jalankan:
```bash
ssh root@IP_ADDRESS_VPS_ANDA
```
*(Masukkan password VPS saat diminta)*.

### 3.2 Update Paket Sistem
```bash
apt update && apt upgrade -y
```

### 3.3 Install Node.js v20 LTS, Git, dan Nginx
```bash
# Tambahkan repositori NodeSource Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

# Install Node.js, Git, Nginx, dan Build Tools (dibutuhkan better-sqlite3)
apt install -y nodejs git nginx build-essential

# Verifikasi instalasi
node -v
npm -v
```

### 3.4 Install PM2 (Process Manager)
```bash
npm install -g pm2
```

---

## FASE 4: Download dan Setup Project di VPS

### 4.1 Clone Repository
```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/username-anda/floorplan-expo.git floorplan
cd floorplan
```

### 4.2 Setup Backend Server
```bash
cd /var/www/floorplan/server

# Install dependency backend
npm install --production=false

# Buat file konfigurasi .env
cp .env.example .env
nano .env
```
Isi file `.env` dengan:
```env
PORT=5001
APP_ENV=production
ALLOWED_ORIGINS=https://domainanda.com
```
*(Tekan `Ctrl + O` lalu `Enter` untuk menyimpan, lalu `Ctrl + X` untuk keluar)*.

### 4.3 Setup dan Build Frontend
```bash
cd /var/www/floorplan/client

# Buat file .env untuk client agar mengarah ke /api
echo "VITE_API_URL=/api" > .env

# Install dependency dan build file statis
npm install
npm run build
```
Hasil build akan terbuat di `/var/www/floorplan/client/dist`.

---

## FASE 5: Menjalankan Backend dengan PM2

Jalankan server Node.js di background:
```bash
cd /var/www/floorplan/server

# Jalankan backend
pm2 start src/index.js --name "floorplan-backend"

# Atur agar otomatis menyala kembali jika server reboot/mati
pm2 save
pm2 startup
```
*(Jalankan perintah yang disarankan oleh PM2 jika ada output konfirmasi)*.

Cek status backend:
```bash
pm2 status
```
Harus berstatus **`online`**.

---

## FASE 6: Konfigurasi Nginx Web Server

### 6.1 Buat File Konfigurasi Virtual Host
```bash
nano /etc/nginx/sites-available/floorplan
```

Paste konfigurasi berikut (ganti `domainanda.com` dengan nama domain asli Anda):
```nginx
server {
    listen 80;
    server_name domainanda.com www.domainanda.com;

    # Batas ukuran payload upload denah/gambar
    client_max_body_size 50M;

    # 1. Routing Frontend (React Single Page Application)
    location / {
        root /var/www/floorplan/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 2. Routing Backend API (Express)
    location /api/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
*(Simpan dengan `Ctrl + O` lalu `Enter`, keluar dengan `Ctrl + X`)*.

### 6.2 Aktifkan Konfigurasi & Restart Nginx
```bash
# Buat symlink ke sites-enabled
ln -s /etc/nginx/sites-available/floorplan /etc/nginx/sites-enabled/

# Hapus konfigurasi default Nginx jika belum dihapus
rm -f /etc/nginx/sites-enabled/default

# Tes apakah konfigurasi Nginx sudah benar
nginx -t

# Reload Nginx
systemctl reload nginx
```

---

## FASE 7: Pasang SSL / HTTPS Gratis (Let's Encrypt)

```bash
# Install Certbot untuk Nginx
apt install -y certbot python3-certbot-nginx

# Request sertifikat SSL otomatis
certbot --nginx -d domainanda.com -d www.domainanda.com
```
- Masukkan alamat email Anda untuk notifikasi perpanjangan.
- Ketik `Y` untuk menyetujui Terms of Service.
- Certbot akan otomatis mengonfigurasi SSL di file Nginx.

---

## FASE 8: Verifikasi & Selesai! 🎉

Buka browser Anda dan akses:
- **`https://domainanda.com`** -> Menampilkan Live Denah Pameran.
- **`https://domainanda.com/login`** -> Halaman Login Admin.

### Kredensial Login Admin Default:
- **Email**: `superadmin@expo.local`
- **Password**: `superadmin123`
*(Setelah login pertama kali, sangat disarankan segera mengganti password di menu Pengaturan/User).*

---

## 🔄 Cara Update Code di Kemudian Hari (Redeploy)
Jika suatu saat Anda melakukan perubahan di laptop dan ingin memperbarui website di server:

1. Di Laptop:
   ```bash
   git add .
   git commit -m "Update fitur baru"
   git push origin main
   ```
2. Di VPS (via SSH):
   ```bash
   cd /var/www/floorplan
   git pull origin main

   # Update Backend
   cd /var/www/floorplan/server
   npm install
   pm2 restart floorplan-backend

   # Re-build Frontend
   cd /var/www/floorplan/client
   npm install
   npm run build
   ```
Database `floorplan.db` di `/var/www/floorplan/server/data/` **tidak akan terhapus** dan data booking tetap aman 100%!
