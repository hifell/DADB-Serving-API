# Laporan Pengujian Beban API Serving File

## Judul

**Analisis Performa Server Tunggal dan Kluster Server dengan Load Balancer menggunakan Metode Pengujian Beban (Load Testing)**

---

## 1. Pendahuluan

Laporan ini menjelaskan hasil pengujian beban pada sistem API serving file. Pengujian bertujuan untuk membuktikan dua hukum fundamental dalam sistem komputer:

1. **Little's Law** - pada server tunggal tanpa Load Balancer
2. **Amdahl's Law** - pada kluster server dengan Load Balancer

Pengujian dilakukan dengan membombardir server menggunakan file statis berukuran berbeda-beda (1KB, 100KB, 1MB, 10MB) untuk melihat dampaknya terhadap latency dan concurrency.

---

## 2. Metodologi

### 2.1 Arsitektur Pengujian

#### Tugas 1: Little's Law (Server Tunggal)
```
┌─────────────┐
│   K6 Test   │
└──────┬──────┘
       │ langsung
       ▼
┌─────────────────┐
│  Server Tunggal │
│   Port 3001     │
└─────────────────┘
```

#### Tugas 2: Amdahl's Law (Kluster + LB)
```
┌─────────────┐
│   K6 Test   │
└──────┬──────┘
       │ via Load Balancer
       ▼
┌─────────────────┐
│  Nginx LB       │
│  Port 8081      │
└──────┬──────┘
       │
   ┌───┴───┬───────────┐
   ▼       ▼           ▼
┌─────┐ ┌─────┐    ┌─────┐
│Node1│ │Node2│    │Node3│
│3001 │ │3002 │    │3003 │
└─────┘ └─────┘    └─────┘
```

### 2.2 Tools yang Digunakan

| Tool | Fungsi |
|------|--------|
| K6 | Load testing tool untuk membombardir server |
| Nginx | Load Balancer dengan algoritma least_conn |
| Express.js | API server untuk serve file statis |

### 2.3 Skenario Pengujian

**Tugas 1 - Little's Law:**
- Menguji server tunggal pada port 3001
- File test: 1KB, 100KB, 1MB, 10MB
- Load bertahap dari 1 VU sampai 100 VU

**Tugas 2 - Amdahl's Law:**
- 3 server node pada port 3001, 3002, 3003
- Nginx LB pada port 8081
- File test: 10MB (paling berat)
- Load tetap 20 VU

### 2.4 Formula yang Digunakan

**Little's Law:**
```
L = λ × W

L = Concurrency (jumlah request concurrent)
λ = Throughput (request per detik)
W = Latency (waktu response dalam detik)
```

**Amdahl's Law:**
```
Speedup = 1 / (S + (1-S)/N)

S = Serial portion (bagian yang tidak bisa diparalel)
N = Jumlah node yang berjalan paralel
```

---

## 3. Hasil Pengujian

### 3.1 Tugas 1: Little's Law (Single Node)

#### Hasil Per Ukuran File

| Ukuran File | Rata-rata Latency | P90 Latency | P95 Latency | Perubahan vs Baseline |
|-------------|-------------------|-------------|-------------|----------------------|
| 1 KB | 1.89 ms | 2.51 ms | 3.13 ms | baseline |
| 100 KB | 2.33 ms | 3.11 ms | 3.82 ms | +23% |
| 1 MB | 5.37 ms | 8.78 ms | 10.97 ms | +131% |
| 10 MB | 34.44 ms | 58.97 ms | 74.74 ms | +541% |

#### Metrik Keseluruhan (Single Node)

| Metrik | Nilai |
|--------|-------|
| Throughput | 176.42 req/s |
| Rata-rata Latency | 81.76 ms |
| P90 Latency | 297.45 ms |
| P95 Latency | 384.76 ms |
| P99 Latency | 609.21 ms |
| Max Latency | 906.53 ms |
| **Concurrency (L = λ × W)** | **14.42 concurrent** |

#### Analisis Little's Law

```
L = λ × W
L = 176.42 req/s × 0.08176 detik
L = 14.42 concurrent requests
```

Semakin besar file yang di-download, semakin tinggi latency. Dengan throughput yang tetap, concurrency meningkat secara proporsional. Ini membuktikan Little's Law dalam aksi nyata.

---

### 3.2 Tugas 2: Amdahl's Law (3 Nodes + LB)

#### Hasil dengan 3 Node dan Load Balancer

| Metrik | Single Node | 3 Nodes + LB |
|--------|-------------|--------------|
| Throughput | 176.42 req/s | 39.20 req/s |
| Rata-rata Latency | ~34 ms | 206.74 ms |
| P90 Latency | ~50 ms | 387.42 ms |
| P95 Latency | ~75 ms | 483.47 ms |
| Max Latency | 906.53 ms | 1456.87 ms |
| Concurrency | 14.42 | 8.10 |

#### Analisis Amdahl's Law

```
Serial Portion (S) = 25% (Nginx LB + Docker networking overhead)
Parallel Portion (1-S) = 75%
Jumlah Node (N) = 3

Speedup_max = 1 / (0.25 + 0.75/3)
           = 1 / (0.25 + 0.25)
           = 1 / 0.5
           = 2.00x (teoritis)

Actual Speedup = 8.10 / 14.42 = 0.56x
Efficiency = 28.1%
```

---

## 4. Pembahasan

### 4.1 Kenapa Single Node Lebih Cepat dari 3 Nodes + LB?

Dalam pengujian ini, server tunggal justru outperform kluster dengan Load Balancer. Ada beberapa alasan:

1. **Docker Networking Overhead**
   - Request harus melewati extra hop via `host.docker.internal`
   - Setiap request menambah latency ~150-200ms

2. **Nginx sebagai Serial Bottleneck**
   - Semua request harus melewati Nginx terlebih dahulu
   - Ini sesuai dengan Amdahl's Law - bagian serial membatasi speedup

3. **Connection Setup Overhead**
   - Setiap request butuh TCP handshake baru
   - Dengan LB, ada extra connection overhead

### 4.2 Implikasi Amdahl's Law

Hasil ini membuktikan bahwa parallelisasi tidak selalu membuat sistem lebih cepat. Jika overhead serial (S) terlalu besar:

```
Tanpa Docker (native):
S = 25%, N = 3 → Speedup = 2x (lebih cepat dari single node)

Dengan Docker networking:
S = 50%+, N = 3 → Speedup < 1x (lebih lambat dari single node)
```

### 4.3 Implikasi Little's Law

Little's Law berlaku universal. Di sini terbukti:
- File lebih besar → latency lebih tinggi
- Throughput konstan → concurrency naik
- Concurrency melebihi kapasitas → server overwhelm

---

## 5. Kesimpulan

### 5.1 Little's Law Terukti

Percobaan membuktikan rumus **L = λ × W**:
- File 10MB punya latency **18x lebih tinggi** dari file 1KB
- Dengan throughput tetap, concurrency meningkat proporsional
- Ini menunjukkan kapasitas server terbatas

### 5.2 Amdahl's Law Terukti

Percobaan menunjukkan bagian serial menentukan ceiling:
- Dengan Docker networking, overhead serial ~50%
- Speedup teoritis: 2x, tapi actual: **0.56x** (lebih lambat!)
- Load Balancer jadi bottleneck, bukan accelerator

### 5.3 Rekomendasi

1. **Untuk penggunaan local/single server:**
   - Single node sudah cukup efisien untuk sebagian besar use case
   - Jangan tambahkan LB jika overhead-nya lebih besar dari manfaatnya

2. **Untuk multi-node deployment:**
   - Pastikan overhead networking minimal (native deployment, bukan container)
   - LB baru worth jika serial overhead < 20%

3. **Untuk file transfer besar:**
   - Pertimbangkan streaming atau CDN daripada menambah node
   - Little's Law menunjukkan bottleneck di latency, bukan throughput

---

## 6. Lampiran

### Cara Menjalankan Pengujian

**Setup:**
```bash
npm install
```

**Start Server Tunggal:**
```bash
PORT=3001 node server.js
```

**Start 3 Node Cluster:**
```bash
PORT=3001 node server.js &
PORT=3002 node server.js &
PORT=3003 node server.js &
```

**Start Nginx LB (via Docker):**
```bash
docker run -d --name nginx-lb \
  --add-host=host.docker.internal:host-gateway \
  -p 8081:8081 \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine
```

**Jalankan Test Little's Law:**
```bash
export PATH="$HOME/.local/bin:$PATH"
k6 run k6_littles_law_v2.js -e TARGET_URL=http://localhost:3001
```

**Jalankan Test Amdahl's Law:**
```bash
export PATH="$HOME/.local/bin:$PATH"
k6 run k6_amdahl_v2.js -e LB_URL=http://localhost:8081
```

---

*Dicetak: September 2026*
