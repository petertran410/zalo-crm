# Order Builder — Legacy Files Backup

📅 **Ngày tạo**: 2026-07-29
🎯 **Lý do**: Redesign UI Order Builder từ Flow Canvas ngang → Vertical Sections

## Files đã backup

| File | Vai trò cũ |
|---|---|
| `VisualOrderModal.vue` | Root modal component — chứa state management, handlers, submit logic |
| `FlowCanvas.vue` | Flow canvas ngang 5 cột với SVG connection lines |
| `SidebarPalette.vue` | Sidebar chọn sản phẩm + tab khuyến mãi |

## Thay thế bởi

| File mới | Vai trò |
|---|---|
| `workspace/OrderBuilderWorkspace.vue` | Root component mới (vertical sections) |
| `workspace/SectionAccordion.vue` | Accordion container |
| `workspace/Section1Customer.vue` | Section khách hàng |
| `workspace/Section2Products.vue` | Section sản phẩm + khuyến mãi |
| `workspace/Section3Logistics.vue` | Section vận chuyển & thanh toán |
| `workspace/Section4Review.vue` | Section review & submit |

## Rollback

Để rollback về phiên bản cũ:
1. Đổi import trong `ChatContactPanel.vue` dòng ~1221 từ `workspace/OrderBuilderWorkspace.vue` → `_legacy/VisualOrderModal.vue`
2. Đổi tên component trong template tương ứng
