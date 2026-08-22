# BOOKSTORE & LIFESTYLE RETAIL MANAGEMENT SYSTEM
## Implementation Master Specification

> Tài liệu tham chiếu dành cho AI Coding Agent để phân tích, thiết kế và triển khai một hệ thống quản lý chuỗi nhà sách quy mô lớn, tương tự mô hình bán lẻ của FAHASA: ngoài sách còn kinh doanh văn phòng phẩm, đồ chơi, phụ kiện, quà tặng, dụng cụ học tập, mỹ thuật, lifestyle, sản phẩm theo IP/series và các mặt hàng bán lẻ liên quan.

---

# 1. Mục tiêu dự án

Xây dựng một **Retail Management Platform đa chi nhánh** có khả năng quản lý toàn bộ hoạt động của một chuỗi nhà sách lớn:

- Bán hàng tại quầy POS.
- Bán hàng online.
- Quản lý sản phẩm đa ngành hàng.
- Quản lý hàng chục nghìn đến hàng trăm nghìn SKU.
- Quản lý nhiều cửa hàng và kho.
- Quản lý nhập hàng, nhà cung cấp và công nợ.
- Điều chuyển hàng giữa các chi nhánh.
- Quản lý khách hàng và chương trình thành viên.
- Khuyến mãi, voucher, combo, gift set.
- Quản lý đơn hàng, giao hàng, đổi trả.
- Quản lý nhân sự và phân quyền.
- Báo cáo, analytics và dashboard quản trị.
- Audit log, bảo mật, kiểm soát gian lận.
- Có khả năng mở rộng về sau.

Hệ thống không được thiết kế như một demo đơn giản. Kiến trúc, database và business logic phải đủ thực tế để có thể tiếp tục phát triển thành sản phẩm production.

---

# 2. Định nghĩa hệ thống

Tên tham khảo:

**Bookstore & Lifestyle Retail Management System**

Hoặc:

**Omnichannel Bookstore Retail Platform**

Hệ thống phục vụ các nhóm:

1. Khách hàng.
2. Nhân viên bán hàng.
3. Thu ngân.
4. Nhân viên kho.
5. Quản lý cửa hàng.
6. Quản lý khu vực.
7. Bộ phận mua hàng.
8. Marketing.
9. Kế toán.
10. Quản trị hệ thống.
11. Owner / Director / Head Office.

---

# 3. Phạm vi ngành hàng

Không hard-code hệ thống chỉ dành cho sách.

Phải xây dựng theo mô hình **generic Product + Category + Attributes + Variants**.

## 3.1 Sách

Ví dụ:

- Văn học.
- Kinh tế.
- Kỹ năng.
- Tâm lý.
- Giáo dục.
- Sách giáo khoa.
- Ngoại văn.
- Manga.
- Comic.
- Light novel.
- Sách thiếu nhi.
- Sách tham khảo.
- Từ điển.
- Sách chuyên ngành.

Thuộc tính riêng:

- ISBN-10.
- ISBN-13.
- Tác giả.
- Dịch giả.
- Nhà xuất bản.
- Nhà phát hành.
- Ngày phát hành.
- Ngôn ngữ.
- Số trang.
- Kích thước.
- Loại bìa.
- Edition.
- Lần tái bản.

## 3.2 Văn phòng phẩm

Ví dụ:

- Bút.
- Vở.
- Giấy.
- Sổ tay.
- File hồ sơ.
- Máy tính.
- Thước.
- Compa.
- Dụng cụ học tập.

Thuộc tính:

- Thương hiệu.
- Màu sắc.
- Loại ngòi.
- Kích thước.
- Chất liệu.
- Quy cách đóng gói.

## 3.3 Đồ chơi

- LEGO.
- Board game.
- Puzzle.
- Đồ chơi giáo dục.
- Mô hình.
- Figure.
- Plush.
- Đồ chơi trẻ em.

Thuộc tính:

- Độ tuổi.
- Series.
- Brand.
- Character / IP.
- Chất liệu.
- Kích thước.
- Cảnh báo an toàn.

## 3.4 Lifestyle / phụ kiện

- Balo.
- Túi.
- Bình nước.
- Hộp bút.
- Móc khóa.
- Ly.
- Sticker.
- Bookmark.
- Đồ trang trí bàn học.

## 3.5 Mỹ thuật

- Màu.
- Cọ.
- Canvas.
- Sketchbook.
- Marker.
- Dụng cụ handmade.

## 3.6 Gift & Seasonal

- Quà sinh nhật.
- Thiệp.
- Gift box.
- Combo quà.
- Giáng sinh.
- Trung thu.
- Back-to-school.
- Valentine.
- Tết.

## 3.7 Licensed / IP merchandise

Ví dụ:

- Pokémon.
- Doraemon.
- Marvel.
- Disney.
- Gundam.
- Sanrio.
- One Piece.

Một IP có thể liên kết với nhiều sản phẩm thuộc nhiều category khác nhau.

---

# 4. Nguyên tắc thiết kế sản phẩm

Không tạo các bảng riêng hoàn toàn như:

- books
- toys
- bags
- pens

theo kiểu mỗi category một hệ thống.

Nên xây dựng:

```text
Product
 ├── Category
 ├── Brand
 ├── Supplier
 ├── Product Attributes
 ├── Product Variants
 │    └── SKU
 │         ├── Barcode
 │         ├── Price
 │         └── Inventory
 ├── Media
 ├── Tags
 └── Related Products
```

Các thuộc tính riêng theo category sử dụng:

- attribute definitions
- attribute values

Ví dụ:

```text
Category: Book

Attributes:
- ISBN
- Author
- Publisher
- Translator
- Language
- Page Count
```

```text
Category: Backpack

Attributes:
- Color
- Capacity
- Material
- Size
```

Mục tiêu: hệ thống có thể thêm ngành hàng mới mà không cần thay đổi toàn bộ schema.

---

# 5. Mô hình tổ chức

```text
Organization
│
├── Head Office
│
├── Region
│   ├── Store A
│   ├── Store B
│   └── Store C
│
└── Warehouses
    ├── Central Warehouse
    └── Regional Warehouse
```

Mỗi Store có thể có:

- khu bán hàng.
- kho sau cửa hàng.
- nhiều quầy POS.
- nhiều nhân viên.
- nhiều khu vực / tầng / kệ.

---

# 6. Vai trò và phân quyền

Phải sử dụng RBAC hoặc RBAC + permission-based authorization.

## 6.1 Cashier

Có thể:

- tạo giao dịch POS.
- quét barcode.
- áp dụng promotion hợp lệ.
- nhận thanh toán.
- in hóa đơn.
- tra cứu khách hàng.
- tạo đổi trả theo quyền cho phép.

Không được:

- thay đổi giá gốc.
- điều chỉnh tồn kho tùy ý.
- xem báo cáo tài chính toàn hệ thống.

## 6.2 Sales Staff

- tra cứu sản phẩm.
- xem vị trí kệ.
- kiểm tra tồn kho.
- giữ hàng.
- tạo yêu cầu chuyển hàng.
- hỗ trợ khách.

## 6.3 Warehouse Staff

- nhập hàng.
- picking.
- packing.
- kiểm kê.
- chuyển kho.
- xử lý hàng lỗi.
- xử lý stock adjustment theo workflow.

## 6.4 Store Manager

- quản lý một cửa hàng.
- duyệt discount trong phạm vi cho phép.
- duyệt stock adjustment.
- xem doanh thu cửa hàng.
- quản lý nhân sự cửa hàng.
- duyệt transfer.
- xem KPI.

## 6.5 Regional Manager

- xem nhiều cửa hàng.
- so sánh hiệu suất.
- cân bằng tồn kho.
- duyệt transfer liên vùng.

## 6.6 Purchasing

- quản lý supplier.
- purchase order.
- nhập hàng.
- giá mua.
- lead time.
- trả hàng supplier.

## 6.7 Marketing

- promotion.
- voucher.
- campaign.
- segmentation.
- loyalty rewards.

## 6.8 Accountant

- đối soát.
- payment reconciliation.
- supplier payable.
- refund.
- cash movement.
- báo cáo tài chính liên quan retail.

## 6.9 Admin

- user.
- role.
- permission.
- cấu hình hệ thống.
- integration.
- audit.

## 6.10 Owner / Director

- dashboard toàn hệ thống.
- doanh thu.
- margin.
- tồn kho.
- hiệu suất chi nhánh.
- top / slow-moving products.
- purchasing.
- customer analytics.

---

# 7. Các ứng dụng / giao diện

Hệ thống nên tách thành các bề mặt sử dụng khác nhau.

## 7.1 Admin / Management Web

Dành cho:

- Owner.
- Manager.
- Purchasing.
- Marketing.
- Accountant.
- Admin.

Responsive desktop-first.

## 7.2 POS App

Tối ưu cho:

- desktop.
- màn hình cảm ứng.
- tablet POS.

Yêu cầu:

- thao tác cực nhanh.
- hỗ trợ barcode scanner.
- keyboard shortcuts.
- tối thiểu số click.

## 7.3 Staff Mobile App

Dùng tại cửa hàng:

- quét barcode.
- tìm sản phẩm.
- xem vị trí kệ.
- tồn kho.
- kiểm kê.
- picking.
- chuyển kho.
- nhận hàng.

## 7.4 Customer Web / App

- tìm kiếm.
- mua hàng.
- thành viên.
- wishlist.
- đặt giữ hàng.
- click & collect.
- giao hàng.

---

# 8. Module 1 — Product Catalog Management

## Chức năng

- CRUD sản phẩm.
- CRUD category.
- category hierarchy.
- brand.
- publisher.
- author.
- supplier.
- product tags.
- product attributes.
- variants.
- SKU.
- barcode.
- multiple barcodes.
- product images.
- cover images.
- product dimensions.
- weight.
- tax.
- lifecycle status.

## Product status

```text
draft
active
inactive
discontinued
out_of_print
preorder
archived
```

## SKU

Mỗi variant phải có SKU riêng.

Ví dụ:

```text
Product:
Balo XYZ

Variants:
- Black 20L -> SKU BALO-XYZ-BLK-20
- Blue 20L  -> SKU BALO-XYZ-BLU-20
```

Sách thường có một SKU, nhưng special edition hoặc boxset có SKU khác.

---

# 9. Module 2 — Category & Attribute Engine

Cho phép Admin định nghĩa attribute theo category.

Ví dụ:

```text
Category: Book

ISBN: text
Author: relation
Publisher: relation
Language: enum
Pages: integer
Cover Type: enum
```

```text
Category: Toy

Age Range: enum
Material: multi-select
Character: relation
Safety Warning: text
```

Không hard-code các field business-specific vào UI nếu có thể quản lý bằng metadata.

---

# 10. Module 3 — Inventory Management

Đây là module quan trọng nhất.

Inventory phải theo:

```text
SKU + Location
```

Không chỉ lưu:

```text
product.stock = 100
```

Phải có inventory ledger / movement history.

Ví dụ location:

```text
Central Warehouse
Store A Stockroom
Store A Shelf A12
Store B Stockroom
```

## Inventory quantities

Nên phân biệt:

- on_hand
- reserved
- available
- damaged
- in_transit
- incoming

Công thức:

```text
available = on_hand - reserved
```

## Inventory movement

Mọi thay đổi tồn kho phải tạo movement.

Ví dụ:

```text
PURCHASE_RECEIPT
SALE
RETURN
TRANSFER_OUT
TRANSFER_IN
STOCK_ADJUSTMENT
DAMAGED
LOST
RESERVATION
RESERVATION_RELEASE
```

Không cho phép update trực tiếp quantity mà không có audit trail.

---

# 11. Module 4 — Store Location / Shelf Management

Đặc biệt hữu ích với nhà sách lớn.

Cấu trúc:

```text
Store
 └── Floor
      └── Zone
           └── Shelf
                └── Bin
```

Ví dụ:

```text
Nguyễn Huệ
Floor 2
Vietnamese Literature
Shelf VHVN-A12
Bin 03
```

Nhân viên tìm sản phẩm:

```text
Dế Mèn Phiêu Lưu Ký

Store: Nguyễn Huệ
Stock: 7
Location: Floor 2 > VHVN > A12 > Bin 03
```

Có thể hỗ trợ nhiều shelf location cho cùng SKU.

---

# 12. Module 5 — Point of Sale

## POS flow

```text
Open Shift
→ Scan Product
→ Build Cart
→ Identify Customer
→ Promotion Engine
→ Payment
→ Receipt
→ Inventory Deduction
→ Loyalty Update
```

## POS features

- barcode scan.
- search product.
- search SKU.
- quantity.
- remove line.
- price override theo quyền.
- discount.
- promotion.
- voucher.
- loyalty points.
- gift card.
- split payment.
- cash.
- card.
- QR payment.
- e-wallet.
- receipt.
- invoice.
- hold cart.
- resume cart.
- cancel transaction.
- return.
- exchange.

## POS Shift

Mỗi cashier phải:

```text
Open Shift
Opening Cash
Transactions
Cash In / Cash Out
Closing Cash
Expected Cash
Variance
Close Shift
```

---

# 13. Module 6 — Customer Management

Customer profile:

- name.
- phone.
- email.
- birthday.
- gender nếu người dùng tự cung cấp.
- address.
- membership ID.
- membership tier.
- points.
- purchase history.
- wishlist.
- preferences.
- consent.
- communication preferences.

Không thu thập dữ liệu không cần thiết.

---

# 14. Module 7 — Loyalty

Ví dụ tier:

```text
Member
Silver
Gold
Platinum
```

Rule có thể cấu hình:

```text
10.000 VND = 1 point
```

Hỗ trợ:

- earn points.
- redeem.
- bonus.
- expired points.
- adjustment.
- tier upgrade.
- birthday reward.
- member exclusive offers.

Loyalty phải có ledger.

Không lưu mỗi `customer.points` mà không có lịch sử cộng/trừ.

---

# 15. Module 8 — Promotions Engine

Hỗ trợ:

## Promotion types

- percentage discount.
- fixed discount.
- buy X get Y.
- bundle.
- category discount.
- brand discount.
- member discount.
- tier discount.
- time-based promotion.
- store-specific promotion.
- online-only.
- POS-only.
- voucher.
- coupon code.

Ví dụ:

```text
Mua 2 manga → giảm 10%

Mua 3 notebook → tặng 1 pen

Gold member → giảm 5% selected products
```

Promotion phải có:

- priority.
- stackable flag.
- usage limit.
- customer usage limit.
- start/end time.
- applicable stores.
- applicable channels.
- applicable categories/SKUs.

---

# 16. Module 9 — Product Bundle / Combo

Ví dụ:

```text
Back To School Combo

1 Backpack
5 Notebook
3 Pens
1 Pencil Case
```

Bundle cần:

- bundle SKU.
- component SKUs.
- component quantities.
- bundle price.
- inventory availability.

Khi bán bundle phải trừ inventory của component.

---

# 17. Module 10 — Supplier Management

Supplier:

- company name.
- tax code.
- contacts.
- address.
- payment terms.
- lead time.
- supplied categories.
- supplier rating.
- active status.

Đặc biệt với sách:

- publisher.
- distributor.
- consignment supplier.

---

# 18. Module 11 — Purchasing

Flow:

```text
Purchase Request
→ Approval
→ Purchase Order
→ Supplier Confirmation
→ Goods Receipt
→ Invoice
→ Payable
```

Purchase Order:

- supplier.
- warehouse.
- products.
- ordered quantity.
- unit cost.
- expected date.
- status.

Status:

```text
draft
pending_approval
approved
sent
partially_received
received
cancelled
closed
```

---

# 19. Module 12 — Goods Receiving

Không được mặc định supplier giao đủ hàng.

Ví dụ PO:

```text
Ordered: 100
Received: 92
Damaged: 3
Missing: 5
```

Goods Receipt phải ghi:

- actual quantity.
- damaged quantity.
- batch nếu cần.
- receiving staff.
- warehouse.
- timestamp.

---

# 20. Module 13 — Stock Transfer

Flow:

```text
Transfer Request
→ Approval
→ Picking
→ Dispatch
→ In Transit
→ Receiving
→ Completed
```

Ví dụ:

Store A sắp hết sách.

Store B còn 40.

Manager yêu cầu chuyển 15.

Inventory:

```text
Store B:
on_hand -15

In transit:
+15

Store A khi nhận:
on_hand +15
```

Không cộng tồn Store A trước khi hàng thực sự được nhận.

---

# 21. Module 14 — Smart Replenishment

Hệ thống có thể gợi ý nhập/chuyển hàng.

Dữ liệu sử dụng:

- current stock.
- average daily sales.
- lead time.
- safety stock.
- seasonality.
- incoming stock.
- reservations.

Ví dụ:

```text
Stock = 3
Average Sales = 4/day
Supplier Lead Time = 5 days
Safety Stock = 10

→ Risk of stockout
→ Recommended reorder = 30
```

Giai đoạn đầu có thể sử dụng rule-based engine.

Không cần AI/ML phức tạp ngay từ MVP.

---

# 22. Module 15 — Omnichannel Order Management

Order có thể đến từ:

```text
POS
Website
Mobile App
Marketplace
Call Center
```

Order phải lưu `channel`.

Order types:

- delivery.
- pickup.
- ship-from-store.
- reserve-at-store.

---

# 23. Module 16 — Click & Collect

Khách:

```text
Search Product
→ Select Store
→ Reserve
→ Store Picks Product
→ Ready For Pickup
→ Customer Pickup
```

Reservation phải giữ inventory.

Có expiration:

```text
Reservation expires after X hours.
```

Nếu hết hạn:

```text
reserved stock → available stock
```

---

# 24. Module 17 — Order Fulfillment

Workflow:

```text
New
→ Confirmed
→ Allocated
→ Picking
→ Packed
→ Ready
→ Shipped
→ Delivered
```

Failure:

```text
cancelled
failed_delivery
returned
```

Picking app nên hỗ trợ:

- barcode verification.
- shelf route.
- quantity validation.

---

# 25. Module 18 — Returns & Exchanges

Các trường hợp:

- khách trả hàng.
- đổi sản phẩm.
- hàng lỗi.
- giao sai.
- online return.
- POS return.

Return phải tham chiếu transaction/order gốc nếu có.

Refund:

- cash.
- original payment method.
- store credit.
- voucher.

Returned item phải có disposition:

```text
RESTOCK
DAMAGED
RETURN_TO_SUPPLIER
DISCARD
```

---

# 26. Module 19 — Supplier Return

Đặc biệt quan trọng với:

- sách ký gửi.
- sách chậm bán.
- hàng lỗi.
- seasonal products.

Flow:

```text
Return Request
→ Approval
→ Picking
→ Shipping Supplier
→ Supplier Confirmation
→ Credit Note
```

---

# 27. Module 20 — Consignment

Một số sách/hàng có thể bán theo ký gửi.

Phải phân biệt:

```text
Owned Inventory
Consignment Inventory
```

Hệ thống theo dõi:

- supplier ownership.
- quantity sold.
- amount payable.
- unsold return.

---

# 28. Module 21 — Pricing

Không lưu duy nhất `product.price`.

Nên có:

```text
Price List
```

Ví dụ:

- Retail Price.
- Member Price.
- Online Price.
- Store-specific Price.
- Campaign Price.

Price phải có thời gian hiệu lực.

```text
valid_from
valid_to
```

Lịch sử giá phải được giữ lại.

---

# 29. Module 22 — Barcode Management

Hỗ trợ:

- EAN-13.
- ISBN barcode.
- internal barcode.
- supplier barcode.

Một SKU có thể có nhiều barcode.

Barcode phải unique.

---

# 30. Module 23 — Gift Card / Store Credit

Gift Card:

- code.
- balance.
- status.
- expiration.
- transactions.

Store Credit:

- customer.
- balance.
- ledger.

---

# 31. Module 24 — Employee Management

Không cần biến hệ thống thành HRM hoàn chỉnh.

Chỉ cần:

- employee.
- store assignment.
- role.
- shift.
- active status.
- POS permission.
- manager hierarchy.

Có thể tích hợp HRM ngoài sau này.

---

# 32. Module 25 — Dashboard

## Owner Dashboard

Hiển thị:

- revenue today.
- revenue MTD.
- revenue YTD.
- gross margin.
- orders.
- average order value.
- units sold.
- customer count.
- inventory value.
- stock turnover.
- low stock.
- slow-moving inventory.
- return rate.

## Charts

- sales by day.
- sales by hour.
- sales by category.
- sales by store.
- online vs offline.
- top products.
- slow products.
- inventory aging.

---

# 33. Module 26 — Store Performance

So sánh:

```text
Store
Revenue
Growth
Orders
AOV
Margin
Inventory Turnover
Returns
Staff Sales
```

Cho phép drill-down.

---

# 34. Module 27 — Product Analytics

Theo dõi:

- units sold.
- revenue.
- margin.
- sales velocity.
- days of inventory.
- sell-through rate.
- return rate.

Segments:

- category.
- brand.
- author.
- publisher.
- supplier.
- IP.
- store.

---

# 35. Module 28 — Inventory Aging

Nhóm tồn:

```text
0–30 days
31–60
61–90
91–180
180+
```

Manager cần thấy:

```text
Products >180 days inventory
Inventory value
Suggested actions
```

Actions:

- markdown price.
- promotion.
- transfer.
- supplier return.

---

# 36. Module 29 — Notifications

Ví dụ:

- low stock.
- stockout.
- transfer request.
- PO approval.
- goods received discrepancy.
- high refund.
- unusual discount.
- shift cash variance.
- order delayed.

Channels:

- in-app.
- email.
- push.
- optional webhook.

---

# 37. Module 30 — Audit Log

Bắt buộc.

Log:

```text
actor
action
entity
entity_id
before
after
store
device
ip
timestamp
```

Các hành động cần audit mạnh:

- price change.
- stock adjustment.
- refund.
- order cancellation.
- discount override.
- user permission change.
- supplier cost change.

Audit log không được cho user thông thường sửa/xóa.

---

# 38. Core Business Flows

## 38.1 POS Sale

```text
Cashier login
→ Open shift
→ Scan products
→ Identify customer
→ Calculate promotion
→ Payment
→ Complete transaction
→ Create inventory movement
→ Update loyalty
→ Generate receipt
```

Toàn bộ bước sau payment phải đảm bảo transaction consistency.

## 38.2 Purchase

```text
Demand
→ Purchase Request
→ Approval
→ PO
→ Supplier
→ Goods Receipt
→ Inventory Increase
→ Invoice
```

## 38.3 Transfer

```text
Request
→ Approval
→ Pick
→ Ship
→ In Transit
→ Receive
```

## 38.4 Return

```text
Find original transaction
→ Validate return policy
→ Select items
→ Refund
→ Inventory disposition
→ Audit
```

---

# 39. Database Design — Core Entities

Danh sách tham khảo:

```text
organizations
regions
stores
warehouses
stock_locations

users
employees
roles
permissions
user_roles
role_permissions

categories
category_attributes
attribute_definitions
attribute_values

products
product_variants
skus
product_images
product_barcodes
brands
authors
publishers
licenses
product_relations

suppliers
supplier_products
supplier_price_history

inventory_balances
inventory_movements
inventory_reservations
stock_adjustments

purchase_requests
purchase_orders
purchase_order_items
goods_receipts
goods_receipt_items

stock_transfers
stock_transfer_items

customers
customer_addresses
loyalty_accounts
loyalty_transactions

price_lists
prices
price_history

promotions
promotion_rules
promotion_targets
coupons
coupon_redemptions

bundles
bundle_items

orders
order_items
order_status_history
order_allocations

shipments
shipment_items

pos_terminals
pos_shifts
pos_transactions
pos_transaction_items

payments
payment_transactions
refunds

returns
return_items

gift_cards
gift_card_transactions

supplier_returns
supplier_return_items

notifications

audit_logs
```

Không bắt buộc dùng chính xác tên này, nhưng schema cuối phải thể hiện đầy đủ các domain.

---

# 40. Một số nguyên tắc database quan trọng

## Không lưu tồn kho theo kiểu:

```text
products.stock
```

## Không update tồn kho tùy ý.

Mọi thay đổi phải thông qua inventory transaction.

## Monetary value

Không dùng floating-point cho tiền.

Sử dụng:

```text
BIGINT minor units
```

hoặc:

```text
NUMERIC(precision, scale)
```

Ví dụ VND có thể lưu integer.

## Soft delete

Không soft-delete mọi thứ một cách máy móc.

Các dữ liệu business lịch sử như:

- transactions.
- payments.
- inventory movements.

không được xóa.

Product có thể:

```text
status = inactive
```

---

# 41. Transaction Integrity

Các nghiệp vụ bắt buộc atomic:

## POS completion

```text
create transaction
create payment
deduct inventory
create inventory movement
update order state
update loyalty
```

Nếu một bước quan trọng thất bại phải rollback hoặc có cơ chế recovery rõ ràng.

## Goods Receipt

```text
receive PO
create receipt
increase inventory
create movement
update PO status
```

---

# 42. Concurrency

Hệ thống phải xử lý trường hợp:

- 2 POS bán cùng SKU.
- online order và POS cùng giữ SKU.
- transfer và sale diễn ra đồng thời.

Không dựa vào:

```text
read stock
if stock > 0
update stock - 1
```

một cách naive.

Sử dụng transaction + locking / atomic database operation.

Phải ngăn negative inventory trừ khi business rule cho phép.

---

# 43. Search

Search là chức năng rất quan trọng.

Phải tìm được bằng:

- tên sản phẩm.
- barcode.
- SKU.
- ISBN.
- tác giả.
- publisher.
- brand.
- category.
- keyword.

Có typo tolerance nếu có điều kiện.

Giai đoạn đầu có thể dùng PostgreSQL Full Text Search.

Sau này có thể chuyển:

- Typesense.
- Meilisearch.
- Elasticsearch / OpenSearch.

---

# 44. Kiến trúc đề xuất

Đối với giai đoạn đầu:

```text
Frontend
Next.js / React

Backend
Next.js server/API hoặc Node.js service

Database
PostgreSQL

Auth
Supabase Auth hoặc tương đương

Storage
Supabase Storage / S3-compatible

Realtime
Supabase Realtime khi thực sự cần

Background Jobs
Queue / Cron

Deployment
Vercel + Supabase
```

Không cần microservices ngay.

Ưu tiên:

**Modular Monolith**

Ví dụ:

```text
modules/
 ├── catalog
 ├── inventory
 ├── purchasing
 ├── orders
 ├── pos
 ├── customers
 ├── promotions
 └── analytics
```

Khi quy mô tăng mới tách service.

---

# 45. Frontend Architecture

Đề xuất:

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui hoặc design system riêng
TanStack Query
React Hook Form
Zod
```

UI phải:

- rõ ràng.
- business-oriented.
- responsive.
- keyboard-friendly.
- table mạnh.
- filter mạnh.
- bulk actions.
- trạng thái rõ ràng.

Không thiết kế dashboard theo kiểu template SaaS generic thiếu thông tin.

---

# 46. Backend Architecture

Layer tham khảo:

```text
Controller / API
↓
Application Service
↓
Domain Logic
↓
Repository / Database
```

Business logic quan trọng không được nhét toàn bộ vào UI.

Ví dụ:

```text
calculatePromotion()
allocateInventory()
completeSale()
receivePurchaseOrder()
transferStock()
```

phải nằm ở backend/domain layer.

---

# 47. API

Có thể dùng:

- REST.
- hoặc tRPC.

REST resource tham khảo:

```text
GET /products
GET /products/:id
POST /products

GET /inventory
POST /inventory/transfers

POST /pos/transactions

POST /orders
POST /orders/:id/cancel

POST /purchase-orders
POST /purchase-orders/:id/receive
```

API phải:

- validate input.
- authorize user.
- scope theo store/org.
- audit sensitive actions.
- return consistent errors.

---

# 48. Authentication

Hỗ trợ:

- email/password.
- SSO về sau.
- MFA cho admin nếu có thể.

POS có thể:

- employee login.
- PIN.
- device session.

Session phải có expiration.

---

# 49. Authorization

Không chỉ ẩn button trên frontend.

Backend phải enforce permission.

Ví dụ:

```text
inventory.adjust
inventory.transfer
pos.refund
pos.override_price
product.update
purchase.approve
reports.financial.view
```

Có thể hỗ trợ scope:

```text
organization
region
store
own
```

---

# 50. Row Level Security

Nếu dùng Supabase:

RLS cần được sử dụng đúng cách.

Ví dụ manager Store A:

- chỉ xem dữ liệu Store A nếu role không có scope cao hơn.

Không dùng service role key trên frontend.

---

# 51. Security

AI phải kiểm tra tối thiểu:

- broken access control.
- IDOR.
- SQL injection.
- XSS.
- CSRF nếu applicable.
- insecure direct object references.
- rate limiting.
- brute-force.
- sensitive data exposure.
- unsafe file upload.
- insecure webhooks.
- privilege escalation.

---

# 52. Payments

Không lưu:

- full card number.
- CVV.

Sử dụng payment provider.

Payment state phải tách với order state.

Ví dụ:

```text
Order: CONFIRMED
Payment: PAID
Fulfillment: PICKING
```

---

# 53. Idempotency

Các API quan trọng:

```text
complete payment
create order
receive webhook
complete POS sale
```

nên hỗ trợ idempotency để tránh duplicate transaction khi request retry.

---

# 54. Logging & Monitoring

Phải có:

- application logs.
- error tracking.
- slow request logging.
- DB monitoring.
- payment errors.
- failed jobs.

Có thể dùng:

- Sentry.
- Supabase logs.
- Vercel logs.

---

# 55. Performance

Mục tiêu ban đầu:

- page load nhanh.
- API phổ biến <500ms trong điều kiện bình thường.
- search <1s.
- POS scan gần như tức thời.
- pagination.
- server-side filtering.
- không load 100.000 products một lần.

Các bảng lớn phải có index phù hợp.

Ví dụ:

```text
sku
barcode
isbn
product_name
store_id
inventory_location_id
order_number
created_at
status
```

---

# 56. Caching

Có thể cache:

- category.
- product metadata.
- promotions đã compile.
- store configuration.

Không cache mù:

- real-time stock.
- payment state.

---

# 57. Background Jobs

Các việc nên chạy async:

- email.
- push notifications.
- large imports.
- report generation.
- product feeds.
- inventory sync.
- search indexing.
- nightly replenishment calculation.

---

# 58. Import / Export

Hệ thống retail thực tế cần:

- import Excel/CSV.
- bulk product import.
- price updates.
- inventory count import.
- supplier catalog import.
- export reports.

Import phải có:

```text
validation
preview
error rows
retry
```

Không import trực tiếp dữ liệu lỗi vào production.

---

# 59. Bulk Operations

Admin cần:

- bulk category change.
- bulk price update.
- bulk status.
- bulk supplier assign.
- bulk product export.

Sensitive bulk action cần confirmation và audit.

---

# 60. Physical Inventory Count

Workflow:

```text
Create Count Session
→ Freeze / Snapshot
→ Staff Scan Products
→ Compare Expected vs Counted
→ Review Variance
→ Approve Adjustment
```

Không cho stock adjustment tự động khi nhân viên nhập count.

Manager phải review variance nếu vượt threshold.

---

# 61. Loss Prevention

Theo dõi:

- unusual refunds.
- excessive discounts.
- stock shrinkage.
- cash variance.
- repeated manual price overrides.
- cancellation after payment.

Có dashboard cảnh báo cho manager.

---

# 62. Fraud Rules cơ bản

Ví dụ:

```text
Cashier refund > 3 transactions/day
→ manager review

Price override > 10%
→ require manager PIN

Inventory adjustment > threshold
→ require approval
```

---

# 63. Reports

## Sales

- daily sales.
- monthly sales.
- sales by store.
- sales by category.
- sales by SKU.
- sales by staff.
- sales by channel.

## Inventory

- inventory valuation.
- low stock.
- stockout.
- aging.
- turnover.
- dead stock.
- transfer history.

## Purchasing

- purchase by supplier.
- purchase cost.
- supplier delivery performance.
- PO variance.

## Customer

- active customers.
- repeat customers.
- loyalty.
- customer lifetime value approximation.
- top customers.

---

# 64. AI Features — Optional Future Scope

Không đưa AI vào chỉ để marketing.

Các use case thực sự có ích:

## Demand Forecast

Dự báo nhu cầu SKU.

## Smart Replenishment

Đề xuất đặt hàng.

## Store Balancing

Phát hiện:

```text
Store A: excess stock
Store B: stockout risk
```

→ suggest transfer.

## Product Recommendation

Cross-sell:

```text
Harry Potter book
→ bookmark
→ notebook
→ LEGO
→ figure
```

## Natural Language Analytics

Manager hỏi:

```text
"Tại sao doanh thu tuần này giảm?"
```

AI tổng hợp dữ liệu có dẫn chứng.

AI chỉ đưa recommendation, không tự thực hiện financial/stock actions quan trọng.

---

# 65. Các màn hình chính

## Authentication

1. Login.
2. Forgot password.
3. MFA nếu có.

## Dashboard

4. Executive Dashboard.
5. Store Dashboard.
6. Inventory Dashboard.

## Catalog

7. Product List.
8. Product Detail.
9. Product Create/Edit.
10. Categories.
11. Attributes.
12. Brands.
13. Authors.
14. Publishers.
15. Barcode Management.

## Inventory

16. Inventory Overview.
17. Inventory by Location.
18. Stock Movement.
19. Stock Adjustment.
20. Inventory Count.
21. Low Stock.
22. Inventory Aging.

## Transfer

23. Transfer List.
24. Transfer Detail.
25. Create Transfer.
26. Transfer Receiving.

## Purchasing

27. Suppliers.
28. Supplier Detail.
29. Purchase Requests.
30. Purchase Orders.
31. PO Detail.
32. Goods Receiving.

## POS

33. Open Shift.
34. POS Sales.
35. Payment.
36. Receipt.
37. Hold Orders.
38. Returns.
39. Close Shift.

## Orders

40. Orders.
41. Order Detail.
42. Picking.
43. Packing.
44. Shipment.
45. Store Pickup.

## Customer

46. Customer List.
47. Customer Profile.
48. Loyalty.
49. Points History.

## Marketing

50. Promotions.
51. Promotion Builder.
52. Coupons.
53. Campaigns.

## Staff

54. Employees.
55. Roles.
56. Permissions.

## Reporting

57. Sales Reports.
58. Inventory Reports.
59. Purchasing Reports.
60. Customer Reports.

## System

61. Store Settings.
62. Tax.
63. Payment Methods.
64. Integrations.
65. Audit Logs.

---

# 66. UX requirements

POS:

- barcode-first.
- keyboard shortcuts.
- large touch targets.
- payment workflow tối giản.

Admin:

- data density cao nhưng dễ đọc.
- filter.
- sort.
- saved views.
- pagination.
- quick actions.
- bulk operations.

Mobile Staff:

- camera barcode scanning.
- one-handed usage.
- large buttons.
- offline-friendly cho một số workflow nếu có thể.

---

# 67. Design direction

Không dùng giao diện quá giống generic admin dashboard.

Phong cách:

- hiện đại.
- sáng.
- retail-oriented.
- nhiều dữ liệu nhưng gọn.
- màu status nhất quán.
- typography rõ ràng.

Data table là thành phần rất quan trọng.

Cần có:

- sticky header.
- column customization.
- filters.
- search.
- bulk selection.
- export.

---

# 68. Data Seed

Để demo thực tế:

Tạo ít nhất:

- 5 stores.
- 1 central warehouse.
- 100–500 products.
- nhiều category.
- 20 suppliers.
- 100 customers.
- sample inventory.
- purchase orders.
- sales transactions.
- transfers.
- promotions.

Product data nên đa dạng:

- sách.
- manga.
- stationery.
- toys.
- bags.
- art supplies.
- gifts.
- licensed merchandise.

Không dùng toàn dữ liệu lorem ipsum.

---

# 69. MVP Scope

Không cần làm toàn bộ hệ thống ngay.

## MVP Phase 1

Bắt buộc:

1. Authentication.
2. RBAC.
3. Stores.
4. Product Catalog.
5. SKU.
6. Barcode.
7. Inventory.
8. POS.
9. Customers.
10. Basic Loyalty.
11. Suppliers.
12. Purchase Orders.
13. Goods Receiving.
14. Stock Transfer.
15. Basic Orders.
16. Basic Promotions.
17. Dashboard.
18. Audit Log.

---

# 70. Phase 2

- advanced promotions.
- online ordering.
- click & collect.
- shipping.
- returns.
- gift cards.
- consignment.
- supplier returns.
- detailed analytics.
- inventory counting.

---

# 71. Phase 3

- smart replenishment.
- demand forecasting.
- recommendation.
- marketplace integration.
- ERP/accounting integration.
- advanced warehouse management.
- mobile app.
- advanced loss prevention.

---

# 72. Out of Scope giai đoạn đầu

Không cần triển khai ngay:

- full ERP.
- payroll.
- complete accounting ledger.
- complex WMS robotics.
- multi-country tax.
- AI demand forecasting production-grade.
- microservices.
- Kubernetes.
- event streaming architecture kiểu enterprise.

Không over-engineer.

---

# 73. Testing Strategy

## Unit Tests

Business logic:

- promotion.
- inventory.
- pricing.
- loyalty.
- replenishment.

## Integration Tests

- database.
- API.
- inventory transactions.
- payments.
- order flow.

## End-to-End

Các flow quan trọng:

```text
POS Sale
Purchase Receiving
Stock Transfer
Online Order
Return
```

---

# 74. Critical Test Cases

## Inventory

- concurrent sale.
- reservation.
- transfer while stock changes.
- negative stock prevention.
- duplicate goods receipt.

## POS

- duplicate payment request.
- failed payment.
- refund.
- shift variance.

## Promotion

- overlapping promotions.
- expired promotion.
- usage limit.
- member-only promotion.

---

# 75. Security Tests

AI phải review:

- user Store A truy cập Store B.
- cashier gọi API manager.
- customer xem order người khác.
- price manipulation request.
- stock adjustment API.
- refund API.
- service role exposure.
- file upload.

---

# 76. Definition of Done cho mỗi feature

Một feature chỉ được xem là hoàn thành nếu:

- UI hoàn chỉnh.
- backend thực.
- database thực.
- validation.
- authorization.
- loading state.
- empty state.
- error state.
- success state.
- audit nếu cần.
- tests cho logic quan trọng.
- không dùng mock nếu feature đã bước vào production scope.

---

# 77. Không được giả lập backend

AI Coding Agent không được:

- tạo fake API rồi coi là hoàn thành.
- hard-code stock.
- hard-code user.
- hard-code dashboard metrics.
- dùng localStorage làm database chính.
- fake payment success.
- fake authorization chỉ ở frontend.

Mock chỉ được dùng trong giai đoạn UI prototype.

---

# 78. Code Quality

Yêu cầu:

- TypeScript strict.
- clear naming.
- không duplicate business logic.
- module boundaries.
- shared schema validation.
- environment variables.
- centralized errors.
- migrations.
- seed scripts.

Không tạo một file vài nghìn dòng chứa toàn bộ logic.

---

# 79. Documentation

Repository cần:

```text
README.md
ARCHITECTURE.md
DATABASE.md
SECURITY.md
API.md
BUSINESS_RULES.md
DEPLOYMENT.md
TESTING.md
```

Nếu scope nhỏ có thể gộp nhưng phải có thông tin tương đương.

---

# 80. Environment

Ví dụ:

```text
local
staging
production
```

Không dùng chung production database cho dev.

---

# 81. Database Migration

Mọi schema change phải có migration.

Không chỉnh production database thủ công rồi không lưu migration.

---

# 82. Backup

Production cần:

- database backups.
- restore strategy.
- tested recovery.

---

# 83. Observability

Theo dõi:

- errors.
- API latency.
- DB load.
- failed jobs.
- payment failures.
- order failures.
- stock inconsistency.

---

# 84. Inventory Reconciliation

Nên có job kiểm tra:

```text
inventory balance
vs
inventory movement ledger
```

Nếu có discrepancy phải alert.

---

# 85. Business IDs

Không chỉ sử dụng UUID để nhân viên đọc.

Ví dụ:

```text
Order: ORD-2026-000123
PO: PO-2026-00221
Transfer: TRF-2026-00912
Return: RET-2026-00333
```

Internal DB vẫn có thể dùng UUID.

---

# 86. Time & Timezone

Database timestamp lưu UTC.

UI hiển thị theo timezone của store/user.

---

# 87. Currency

Thiết kế hỗ trợ currency field dù giai đoạn đầu chỉ dùng VND.

---

# 88. Tax

Tax phải configurable.

Không hard-code logic thuế vào UI.

---

# 89. Product Cost

Hỗ trợ:

- latest cost.
- average cost.
- historical purchase cost.

Không để user thông thường xem cost nếu không có quyền.

---

# 90. Margin

```text
Gross Margin = Revenue - COGS
```

Cần thống nhất cách tính COGS.

Giai đoạn đầu có thể dùng weighted average cost.

---

# 91. Inventory Valuation

Cần quy định:

- Weighted Average Cost.
- hoặc FIFO.

Không trộn lẫn tùy tiện.

MVP có thể chọn Weighted Average Cost vì dễ triển khai hơn.

---

# 92. Product Lifecycle

Ví dụ:

```text
Draft
Active
Temporarily Unavailable
Discontinued
Archived
```

Sách có thêm:

```text
Out of Print
Preorder
```

---

# 93. Pre-order

Future module:

- preorder product.
- release date.
- deposit.
- quantity limit.
- allocation.
- notify customer.

---

# 94. Reservations

Reservation source:

```text
customer
online order
store pickup
staff hold
```

Reservation có:

- quantity.
- expiration.
- status.

---

# 95. Product Relations

Hỗ trợ:

```text
related
alternative
frequently_bought_together
same_series
same_author
same_ip
```

---

# 96. Series / Collection

Đặc biệt hữu ích cho:

- manga.
- novels.
- toys.
- licensed products.

Ví dụ:

```text
One Piece
Harry Potter
Pokémon
Gundam
```

---

# 97. Search Customer Journey

Khách tìm:

```text
Harry Potter
```

Hệ thống có thể trả:

```text
Books
Boxsets
LEGO
Bookmarks
Notebooks
Figures
```

Đây là lý do catalog phải hỗ trợ IP / Collection.

---

# 98. API Error Model

Ví dụ:

```json
{
  "code": "INSUFFICIENT_STOCK",
  "message": "Insufficient available stock",
  "details": {
    "sku": "ABC",
    "available": 2,
    "requested": 3
  }
}
```

Không trả raw database errors ra client.

---

# 99. Status Machines

Không dùng status tự do.

Ví dụ Transfer:

```text
DRAFT
REQUESTED
APPROVED
PICKING
IN_TRANSIT
RECEIVED
COMPLETED
CANCELLED
```

Phải validate transition.

Ví dụ không cho:

```text
DRAFT -> RECEIVED
```

---

# 100. Approval Workflows

Các nghiệp vụ nên có approval:

- large discount.
- stock adjustment.
- transfer.
- purchase request.
- purchase order lớn.
- refund bất thường.

Threshold configurable.

---

# 101. Configuration

Không hard-code:

- loyalty rate.
- approval threshold.
- reservation expiration.
- stock warning.
- return period.

Nên có system/store configuration.

---

# 102. Multi-store Rules

Một sản phẩm có thể:

- bán ở mọi store.
- chỉ một số store.
- online only.
- preorder only.

Giá có thể khác theo store.

---

# 103. Channel Rules

Channels:

```text
POS
WEB
APP
MARKETPLACE
```

Promotion và price có thể khác theo channel.

---

# 104. Integration Layer

Thiết kế sẵn abstraction cho:

- payment provider.
- shipping provider.
- email.
- SMS.
- accounting.
- marketplace.

Không để logic provider tràn khắp codebase.

---

# 105. Shipping

Future integration:

- shipping rate.
- create shipment.
- tracking code.
- delivery status.
- webhook.

---

# 106. Audit & Compliance

Các entity không nên bị sửa history:

- payment.
- sale.
- inventory movement.

Nếu cần correction:

tạo reversal / adjustment transaction.

---

# 107. Offline POS — Future

Nếu cần hỗ trợ khi mất mạng:

- local queue.
- limited cached catalog.
- transaction sync.

Đây là feature khó, không cần MVP trừ khi yêu cầu thực tế.

---

# 108. Suggested Repository Structure

```text
apps/
  admin-web/
  pos/
  staff-mobile/

packages/
  ui/
  domain/
  database/
  auth/
  validation/

modules/
  catalog/
  inventory/
  purchasing/
  orders/
  customers/
  loyalty/
  promotions/
  pos/
  reporting/
```

Có thể điều chỉnh theo framework.

---

# 109. Suggested Implementation Order

## Step 1

Foundation:

- repository.
- environment.
- database.
- auth.
- roles.
- stores.

## Step 2

Catalog:

- categories.
- products.
- variants.
- SKU.
- barcode.

## Step 3

Inventory:

- locations.
- balances.
- movement ledger.

## Step 4

POS.

## Step 5

Supplier + Purchasing.

## Step 6

Transfers.

## Step 7

Customers + Loyalty.

## Step 8

Promotions.

## Step 9

Orders.

## Step 10

Dashboard & reports.

## Step 11

Security audit.

## Step 12

Performance & production hardening.

---

# 110. AI Coding Agent Instructions

AI Agent phải:

1. Đọc toàn bộ tài liệu trước khi code.
2. Phân tích dependency giữa các module.
3. Không code toàn bộ hệ thống trong một lần.
4. Chia implementation thành milestones.
5. Thiết kế database trước các module phụ thuộc dữ liệu.
6. Viết migration.
7. Viết business rule rõ ràng.
8. Không giả lập feature đã tuyên bố hoàn thành.
9. Thường xuyên chạy test.
10. Review security sau mỗi module quan trọng.
11. Không tự ý đổi scope lớn mà không ghi rõ lý do.
12. Không over-engineer.

---

# 111. AI phải báo cáo sau mỗi milestone

Format:

```text
Completed
- ...

Database Changes
- ...

APIs Added
- ...

UI Added
- ...

Tests
- ...

Security Considerations
- ...

Known Issues
- ...

Next
- ...
```

---

# 112. AI phải tự audit các lỗi thường gặp

Sau mỗi phase kiểm tra:

- feature có dùng mock không.
- button có thực sự hoạt động không.
- API có authorization không.
- DB schema có migration không.
- data có hard-code không.
- error state có xử lý không.
- concurrency có vấn đề không.
- transaction có atomic không.
- audit log có đủ không.

---

# 113. Production Readiness Checklist

Trước production cần:

- authentication.
- authorization.
- RLS.
- audit.
- backup.
- error monitoring.
- rate limit.
- secure env.
- testing.
- migrations.
- indexes.
- payment idempotency.
- inventory consistency.
- logs.
- staging.
- security review.

---

# 114. Tiêu chí thành công của dự án

Một phiên bản tốt phải chứng minh được các flow sau hoạt động thật:

## Flow 1

Supplier → Purchase Order → Receive Goods → Inventory tăng.

## Flow 2

Inventory → POS Sale → Payment → Inventory giảm.

## Flow 3

Store A → Transfer → Store B → Inventory thay đổi chính xác.

## Flow 4

Customer → Loyalty → Earn / Redeem points.

## Flow 5

Promotion → POS / Order → Giá chính xác.

## Flow 6

Online Order → Reservation → Picking → Fulfillment.

## Flow 7

Return → Refund → Inventory disposition.

## Flow 8

Manager → Dashboard → số liệu lấy từ transaction thật.

Nếu dashboard đang sử dụng dữ liệu fake hoặc stock chỉ là số hard-code thì hệ thống chưa đạt.

---

# 115. North Star

Hệ thống cuối cùng phải trả lời được các câu hỏi thực tế:

- Sản phẩm này hiện còn bao nhiêu?
- Đang nằm ở cửa hàng/kho/kệ nào?
- Cửa hàng nào còn hàng?
- Có bao nhiêu đang được giữ?
- Bao nhiêu đang trên đường chuyển?
- Khi nào cần nhập thêm?
- Nhà cung cấp nào đang cung cấp?
- Giá mua gần nhất bao nhiêu?
- Bán được bao nhiêu trong 30 ngày?
- Margin bao nhiêu?
- Sản phẩm nào tồn quá lâu?
- Cửa hàng nào bán tốt nhất?
- Promotion nào hiệu quả?
- Khách hàng nào quay lại nhiều?
- Ai đã chỉnh tồn kho?
- Ai đã thay đổi giá?
- Tại sao doanh thu thay đổi?

Nếu hệ thống trả lời được các câu hỏi trên bằng dữ liệu thực, có audit và business logic đúng, kiến trúc đã đi đúng hướng.

---

# 116. Kết luận

Đây không chỉ là một website bán sách.

Đây là một:

**Omnichannel Multi-Store Retail Management Platform dành cho chuỗi nhà sách & lifestyle retail.**

Core domain:

```text
Catalog
Inventory
POS
Purchasing
Transfers
Orders
Customers
Loyalty
Promotions
Analytics
Security
```

Ưu tiên lớn nhất trong quá trình triển khai:

1. Data model đúng.
2. Inventory đúng.
3. Transaction consistency.
4. RBAC đúng.
5. Business flow thực.
6. Audit đầy đủ.
7. UI thuận tiện cho từng vai trò.
8. Không fake backend.
9. Không over-engineer.
10. Có khả năng mở rộng.

Tài liệu này là nguồn tham chiếu chính cho AI Coding Agent trong quá trình phân tích và triển khai dự án.
