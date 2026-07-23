# Tính năng CHƯA triển khai — Analytical CRM

> Tài liệu ghi lại các tính năng **được cân nhắc nhưng KHÔNG triển khai** trong tầng Analytical CRM, kèm lý do và điều kiện mở khóa. Đây là quyết định có chủ đích để tập trung nguồn lực vào phần khả thi cao.
>
> Xem kế hoạch triển khai chính tại [`PLAN.md`](./PLAN.md).
> Cập nhật: 2026-07-09

---

## Nguyên tắc

Một tính năng vào danh sách này khi **thiếu điều kiện dữ liệu cốt lõi** mà cả ZaloCRM lẫn POS nội bộ đều không cung cấp được ở thời điểm hiện tại. Chúng **không bị loại bỏ vĩnh viễn** — mỗi mục ghi rõ cần gì để mở khóa sau này.

POS nội bộ được xác nhận là **data master của toàn công ty** (đơn hàng, doanh thu, sản phẩm, giá vốn, chiết khấu, công nợ, ký gửi). Vì vậy phần lớn nhóm commerce đã chuyển sang **khả thi** (xem `PLAN.md`). Danh sách dưới đây chỉ còn các tính năng thiếu **dữ liệu bên ngoài phạm vi cả CRM lẫn POS**.

---

## 1. Share of Wallet (Ước lượng % thị phần ví khách)

**Mục tiêu ban đầu**: Ước lượng % nhu cầu của khách đang mua từ mình so với tổng nhu cầu của họ.

**Vì sao chưa triển khai**:
- Cần biết **tổng chi tiêu của khách cho toàn ngành** (cả phần mua từ đối thủ), không chỉ phần mua từ công ty.
- POS chỉ có dữ liệu giao dịch **nội bộ** — không thể biết khách mua bao nhiêu ở nơi khác.
- Không có dữ liệu ngành, khảo sát khách, hay nguồn bên thứ 3 về tổng cầu.

**Thiếu điều kiện gì**:
- Dữ liệu benchmark ngành (mức chi tiêu trung bình theo phân khúc khách), **hoặc**
- Khảo sát trực tiếp khách hàng về tổng ngân sách / nhu cầu, **hoặc**
- Dữ liệu bên thứ 3 (báo cáo thị trường BĐS, panel tiêu dùng).

**Điều kiện mở khóa**:
- Khi có khảo sát định kỳ thu thập được "tổng nhu cầu/ngân sách" của khách, có thể tính `Share of Wallet = doanh thu POS / tổng nhu cầu ước lượng`.
- Hoặc khi tích hợp nguồn dữ liệu ngành để ước lượng tổng cầu theo phân khúc.

**Giải pháp thay thế tạm thời**: Dùng **Opportunity Score** (đã có trong PLAN, nhóm F) như một proxy định tính cho "dư địa mở rộng" thay vì con số % tuyệt đối.

---

## 2. Price Sensitivity / Elasticity (Độ nhạy giá / Co giãn cầu theo giá)

**Mục tiêu ban đầu**: Xác định khách nào nhạy cảm với giá — hỗ trợ định giá và chính sách chiết khấu.

**Vì sao chưa triển khai**:
- Đo độ co giãn giá cần quan sát **cùng một khách (hoặc nhóm tương đương) phản ứng với nhiều mức giá khác nhau** theo thời gian.
- Cần **đủ biến động giá lịch sử** trên cùng sản phẩm + đủ số lần mua để tách tín hiệu giá khỏi nhiễu.
- Với đặc thù BĐS (mua ít lần, giá trị lớn, mỗi giao dịch gần như độc nhất), dữ liệu lặp lại theo giá rất mỏng → mô hình elasticity không đủ ý nghĩa thống kê.

**Thiếu điều kiện gì**:
- Lịch sử nhiều price points trên cùng sản phẩm/danh mục.
- Đủ mật độ giao dịch lặp lại per khách để ước lượng đường cầu.
- Dữ liệu A/B pricing hoặc lịch sử khuyến mãi có kiểm soát.

**Điều kiện mở khóa**:
- Khi POS tích lũy đủ lịch sử biến động giá + khuyến mãi trên cùng sản phẩm, có thể chạy phân tích elasticity ở **cấp danh mục/sản phẩm** (không phải cấp từng khách BĐS).
- Kết hợp với dữ liệu **Campaign/Promotion Effectiveness** (nhóm F, đã có trong PLAN) để suy ra phản ứng giá gián tiếp.

**Giải pháp thay thế tạm thời**: Dùng **Discount/Margin Erosion** (nhóm A, đã khả thi nhờ POS có giá vốn + chiết khấu) để phát hiện khách được giảm giá vượt mức — đây là góc nhìn thực dụng hơn cho bài toán chiết khấu.

---

## Rà soát điều kiện khi triển khai P2 (POS Adapter)

Các tính năng sau **hiện được xếp khả thi (🟡)** trong `PLAN.md` dựa trên giả định POS trả đủ dữ liệu. **Trong lúc triển khai P2, phải xác minh runtime** (không đoán) rằng POS thực sự expose các trường tương ứng. Nếu thiếu, chuyển tính năng đó xuống tài liệu này kèm lý do:

| Tính năng | Trường POS cần có để giữ trạng thái khả thi |
|---|---|
| Margin/Discount Erosion | `cost_of_goods` (giá vốn) + `discount` theo dòng đơn |
| Cost-to-Serve | giá vốn + doanh thu theo đơn |
| Debt/Deposit Asset Risk | số dư công nợ + giá trị tài sản ký gửi |
| Credit/Payment Risk Scoring | lịch sử thanh toán (đúng hạn/trễ hạn) |
| Fraud/Anomaly Detection | dữ liệu transaction chi tiết (điều chỉnh, hoàn, huỷ) |

> Quy trình: khi P2 khảo sát POS API thực tế, nếu bất kỳ trường nào ở trên **không tồn tại**, cập nhật mục đó vào danh sách chưa-triển-khai này với ghi chú "thiếu trường X từ POS" và gỡ khỏi bảng khả thi trong `PLAN.md`.
