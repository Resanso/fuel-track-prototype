# SIMARDA: Monitoring Armada DLH

Purwarupa sistem monitoring armada truk sampah berbasis GPS untuk transparansi BBM, validasi rute, dan validasi titik pelayanan (TPS) Dinas Lingkungan Hidup.

## Mesin Kecerdasan Buatan (Intelligent Engine)

Proposal ini menonjolkan teknologi analisis cerdas yang melebihi batas pemantauan GPS standar:

1. **Anomaly Detection (Skoring Anomali)**
   Sistem tidak sekadar menyatakan "Truk keluar rute", tetapi mendeteksi pola perjalanan yang secara statistik tidak normal (misalnya dengan _Anomaly Score = 87%_).
2. **Prediksi BBM Berbasis Machine Learning (ML)**
   Alih-alih menggunakan fixed-rate, estimasi konsumsi BBM diprediksi menggunakan model (misal: Random Forest, XGBoost, atau Time-Series) dengan fungsi:
   `Fuel = f(distance, speed, idle, load, stop, road, vehicle)`
   *Baseline kondisi fleet DLH sekarang (menggunakan fixed fuel-rate) menghasilkan MAE 18–25%. Model yang diusulkan ditargetkan menurunkan MAE menjadi <10–15%.*
3. **Validasi Pelayanan (TPS) Matematis**
   Kunjungan TPS didefinisikan secara tegas melalui kombinasi proksimitas dan durasi berhenti:
   `ServiceValidation = Distance(GPS, TPS) < R AND StopDuration > T`
   (Contoh parameter purwarupa: Radius `R = 50 m`, Minimum Stop `T = 120 detik` → *SERVED* / *NOT SERVED*).

## Fitur Aplikasi

- **Peta operasional (`/`)**: posisi armada, rute standar vs lintasan GPS, sorotan segmen anomali, status TPS (SERVED / NOT SERVED), dan panel metrik kendaraan.
- **Prediksi & Rekonsiliasi BBM**: Membandingkan estimasi model ML terhadap laporan administrasi. Memunculkan **Fuel Consumption Anomaly Detection**.
- **Early warning**: Peringatan diturunkan dari *Anomaly Score*, deviasi BBM, dan celah data GPS.
- **Dashboard manajemen (`/manajemen`)**: KPI dan prioritas pemeriksaan untuk **10 armada pilot** (purwarupa dibatasi untuk pembuktian konsep tanpa memerlukan MoU institusi secara masif di awal).

> Data GPS, BBM administrasi, koordinat TPS, dan operasional armada pilot disimulasikan. Model ML pada tahap purwarupa ini diimplementasikan menggunakan pendekatan bobot variabel untuk mendemonstrasikan kapabilitas analisis.

## Struktur

| Lokasi | Isi |
|---|---|
| `src/lib/analytics.ts` | Fungsi murni: jarak GPS, estimasi & rekonsiliasi BBM, deteksi penyimpangan rute, kunjungan TPS, ketersediaan data |
| `src/lib/trip.ts` | Simulator ritase + ping GPS, dan analisis kondisi pada waktu tertentu |
| `src/lib/alerts.ts` | Early warning |
| `src/lib/fleetData.ts` | Data master kendaraan, TPS, penugasan rute, dan skenario uji |
| `src/lib/fleetSim.ts` | Data simulasi armada pilot & histori 12 bulan |
| `tests/` | Unit test & uji skenario (`npm test`) |

## Menjalankan

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 17 test analitik & skenario
```
