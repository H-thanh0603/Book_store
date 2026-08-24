# Load test — catalog & checkout (k6)

Kịch bản "1.000 user, 50 concurrent checkout" trước mỗi đợt sale.

## Mục tiêu (thresholds — k6 fail nếu vi phạm)

| Chỉ số | Ngưỡng |
| --- | --- |
| Catalog p95 (`catalog_request_duration`) | **< 500 ms** |
| Checkout HTTP 5xx (`checkout_server_errors`) | **= 0** |
| Tổng lỗi HTTP (`http_req_failed`) | < 2% |
| Checkout 2xx/409/400/429 hợp lệ | > 95% |

409 là kết quả **hoped-for** khi nhiều người mua giành nhau món cuối cùng — backend
trả đúng tồn kho còn lại để client tự làm mới giỏ hàng, không phải lỗi hệ thống.

## Cài k6

```bash
# macOS
brew install k6
# Debian/Ubuntu
sudo gpg -k && sudo curl -s https://dl.k6.io/keyrings/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6
# Windows: choco install k6
```

## Chạy

```bash
cd bookstore
npm run build && npm start &          # hoặc pm2 start ecosystem.config.js
BASE_URL=http://localhost:3000 k6 run loadtests/k6-catalog-checkout.js
```

Tuỳ biến quy mô:

```bash
CATALOG_VUS=2000 CHECKOUT_VUS=100 DURATION=5m \
  BASE_URL=http://localhost:3000 k6 run loadtests/k6-catalog-checkout.js
```

## Đọc kết quả trong lúc test

Trong quá trình chạy, theo dõi trực tiếp tình trạng server bằng endpoint metrics:

```bash
# login owner lấy cookie bs_session, rồi:
curl -s -H "Cookie: bs_session=..." http://localhost:3000/api/metrics | jq '.dbPool, .totals'
```

Các tín hiệu cần canh:

- `routes[].p95Ms` của `GET /api/storefront` — nếu vượt 500 ms ngay từ ramp 40%,
  dừng test, kiểm tra index/query trước khi mở sale.
- `dbPool.acquireP95Ms` / `waitingHighWater` — pool wait tăng đều nghĩa là
  `DB_POOL_MAX` không đủ cho lưu lượng; giảm checkout concurrency hoặc tăng pool.
- `totals.rateLimited429` — tỉ lệ 429 cao bất thường cho thấy throttle/rate-limit
  đang giữ chân khách thật; xem lại `MAX_CONCURRENT_CHECKOUTS`.

## Sau test

```bash
npx tsx scripts/check-alerts.ts   # xác nhận không job FAILED nào sót lại
```
