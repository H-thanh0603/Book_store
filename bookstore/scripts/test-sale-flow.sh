#!/bin/bash
# Task 2: full HTTP flow test — sale, over-sell block, inventory deduction
set -e
CJ=/tmp/cj
B=http://localhost:3000
STORE=2d94993e-4acb-4cba-8215-e1425a45ceb1   # Nguyễn Huệ (cashier scope)
V=105d20f1-5cea-4020-b28f-27bf1d8ee454       # Dế Mèn Phiêu Lưu Ký

echo "== login =="
curl -s -c $CJ -X POST $B/api/auth -H 'Content-Type: application/json' \
  -d '{"action":"login","email":"cashier.nh@melio.vn","password":"Passw0rd!"}'; echo

SHIFT=$(psql "postgresql://bookstore:bookstore@localhost:5432/bookstore" -t -A -c "SELECT id FROM \"PosShift\" WHERE status='OPEN' LIMIT 1")
if [ -z "$SHIFT" ]; then
  TERM=$(curl -s -b $CJ "$B/api/terminals?storeId=$STORE" | python3 -c "import sys,json;print(json.load(sys.stdin)['terminals'][0]['id'])")
  SHIFT=$(curl -s -b $CJ -X POST $B/api/pos -H 'Content-Type: application/json' \
    -d "{\"action\":\"open_shift\",\"terminalId\":\"$TERM\",\"storeId\":\"$STORE\",\"openingCash\":500000}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['shiftId'])")
fi
echo "shift=$SHIFT"

echo "== inventory BEFORE (NH only) =="
curl -s -b $CJ "$B/api/inventory?variantId=$V&storeId=$STORE" | python3 -c "
import sys,json
for b in json.load(sys.stdin)['balances']:
    if 'Nguyễn Huệ' in b['location']: print(b['location'],'onHand',b['onHand'])"

echo "== SALE: 2x Dế Mèn @89000, promo mua-2-giam-10% => expect total 160200 =="
curl -s -b $CJ -X POST $B/api/pos -H 'Content-Type: application/json' \
  -d "{\"action\":\"sale\",\"shiftId\":\"$SHIFT\",\"storeId\":\"$STORE\",\"items\":[{\"variantId\":\"$V\",\"quantity\":2}],\"payments\":[{\"method\":\"CASH\",\"amount\":160200}]}"; echo

echo "== SALE wrong amount => expect VALIDATION error =="
curl -s -b $CJ -X POST $B/api/pos -H 'Content-Type: application/json' \
  -d "{\"action\":\"sale\",\"shiftId\":\"$SHIFT\",\"storeId\":\"$STORE\",\"items\":[{\"variantId\":\"$V\",\"quantity\":1}],\"payments\":[{\"method\":\"CASH\",\"amount\":1}]}"; echo

echo "== OVER-SELL 9999 => expect INSUFFICIENT_STOCK =="
curl -s -b $CJ -X POST $B/api/pos -H 'Content-Type: application/json' \
  -d "{\"action\":\"sale\",\"shiftId\":\"$SHIFT\",\"storeId\":\"$STORE\",\"items\":[{\"variantId\":\"$V\",\"quantity\":9999}],\"payments\":[{\"method\":\"CASH\",\"amount\":1000}]}"; echo

echo "== BAD INPUT (missing amount) => expect VALIDATION not INTERNAL =="
curl -s -b $CJ -X POST $B/api/pos -H 'Content-Type: application/json' \
  -d "{\"action\":\"sale\",\"shiftId\":\"$SHIFT\",\"storeId\":\"$STORE\",\"items\":[{\"variantId\":\"$V\",\"quantity\":1}],\"payments\":[{\"method\":\"CASH\"}]}"; echo

echo "== inventory AFTER (NH stockroom should be -2) =="
curl -s -b $CJ "$B/api/inventory?variantId=$V&storeId=$STORE" | python3 -c "
import sys,json
for b in json.load(sys.stdin)['balances']:
    if 'Nguyễn Huệ' in b['location']: print(b['location'],'onHand',b['onHand'])"
