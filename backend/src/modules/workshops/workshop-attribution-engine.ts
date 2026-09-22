/**
 * Workshop Attribution & Sales Conversion Engine
 * Module tập trung toàn bộ Định nghĩa Nguồn Dữ Liệu, Công thức Tính Toán và Logic Quy kết Doanh thu
 */

export interface FormulaDefinition {
  id: string;
  name: string;
  symbol: string;
  formulaText: string;
  formulaLatex?: string;
  sourceTables: string[];
  sourceFields: string[];
  rule: string;
  description: string;
  interpretation: string;
}

export interface DataSourceDefinition {
  table: string;
  displayName: string;
  description: string;
  keyFields: string[];
  joinCondition: string;
}

/**
 * 1. Từ điển Nguồn Dữ Liệu (Data Sources Dictionary)
 */
export const DATA_SOURCES: DataSourceDefinition[] = [
  {
    table: 'Workshop',
    displayName: 'Sự kiện / Workshop',
    description: 'Bảng lưu trữ thông tin các buổi workshop đã tổ chức',
    keyFields: ['id', 'startsAt', 'endsAt', 'title', 'slug', 'branch', 'location'],
    joinCondition: 'Workshop.id = WorkshopGuest.workshopId',
  },
  {
    table: 'WorkshopGuest',
    displayName: 'Khách mời Workshop',
    description: 'Danh sách khách mời đăng ký và tham gia sự kiện',
    keyFields: ['id', 'workshopId', 'phone', 'phoneNormalized', 'fullName', 'status', 'contactId', 'registeredAt', 'checkedInAt'],
    joinCondition: 'WorkshopGuest.phoneNormalized = Contact.phoneNormalized HOẶC WorkshopGuest.contactId = Contact.id',
  },
  {
    table: 'Contact',
    displayName: 'Danh bạ Khách hàng CRM',
    description: 'Hồ sơ khách hàng thống nhất trong CRM',
    keyFields: ['id', 'phone', 'phoneNormalized', 'fullName'],
    joinCondition: 'Contact.id = PosOrder.contactId HOẶC Contact.phoneNormalized = PosOrder.customerPhone',
  },
  {
    table: 'PosOrder',
    displayName: 'Đơn hàng POS',
    description: 'Dữ liệu giao dịch mua hàng thực tế từ hệ thống POS',
    keyFields: ['id', 'posOrderId', 'code', 'orderDate', 'finalAmount', 'grandTotal', 'status', 'customerPhone', 'contactId', 'branchName'],
    joinCondition: 'PosOrder.orderDate >= Workshop.startsAt VÀ PosOrder.status = "Completed"',
  },
  {
    table: 'PosOrderItem',
    displayName: 'Chi tiết Món / Sản phẩm POS',
    description: 'Dữ liệu từng sản phẩm, số lượng và thành tiền trong đơn hàng POS',
    keyFields: ['id', 'posOrderId', 'posProductId', 'productCode', 'productName', 'quantity', 'totalPrice'],
    joinCondition: 'PosOrderItem.posOrderId = PosOrder.id',
  },
];

/**
 * 2. Danh mục Công thức Chuẩn hóa (Formula Catalog)
 */
export const FORMULA_CATALOG: FormulaDefinition[] = [
  {
    id: 'attributed_revenue',
    name: 'Doanh thu Chuyển đổi (Attributed Revenue)',
    symbol: 'Revenue',
    formulaText: 'Tổng giá trị finalAmount của các đơn POS hợp lệ phát sinh từ ngày sự kiện trở đi',
    formulaLatex: '\\text{Revenue} = \\sum \\text{PosOrder.finalAmount} \\quad [\\text{orderDate} \\ge \\text{startsAt} \\land \\text{status} = \\text{\\"Completed\\"}]',
    sourceTables: ['PosOrder', 'WorkshopGuest', 'Workshop'],
    sourceFields: ['PosOrder.finalAmount', 'PosOrder.orderDate', 'PosOrder.status', 'Workshop.startsAt'],
    rule: 'Đơn hàng POS thuộc về khách mời (khớp SĐT hoặc Contact ID), có orderDate >= ngày sự kiện, status = "Completed"',
    description: 'Đo lường tổng giá trị tiền hàng thực thu được từ khách sau khi họ tham dự workshop.',
    interpretation: 'Chỉ số trực tiếp thể hiện giá trị doanh số thực tế mà buổi workshop đóng góp cho doanh nghiệp.',
  },
  {
    id: 'conversion_rate',
    name: 'Tỷ lệ Chuyển đổi Khách mua (Conversion Rate - CR)',
    symbol: 'CR (%)',
    formulaText: '(Số khách có ít nhất 1 đơn hàng POS sau sự kiện / Tổng số khách tham gia sự kiện) × 100%',
    formulaLatex: '\\text{CR} = \\frac{\\text{Unique Buyers}}{\\text{Total Attended Guests}} \\times 100\\%',
    sourceTables: ['WorkshopGuest', 'PosOrder'],
    sourceFields: ['WorkshopGuest.id', 'WorkshopGuest.status', 'PosOrder.id'],
    rule: 'Đếm số lượng khách tham dự duy nhất (Unique Guests) có phát sinh tối thiểu 1 đơn hàng POS thành công.',
    description: 'Tỷ lệ phần trăm khách tham dự sự kiện ra quyết định mua hàng trong chu kỳ kinh doanh.',
    interpretation: 'Đánh giá mức độ hiệu quả của nội dung workshop, khả năng thuyết phục và giới thiệu sản phẩm của đội ngũ.',
  },
  {
    id: 'aov',
    name: 'Giá trị Đơn hàng Trung bình (Average Order Value - AOV)',
    symbol: 'AOV (₫)',
    formulaText: 'Tổng doanh thu chuyển đổi / Tổng số đơn hàng chuyển đổi',
    formulaLatex: '\\text{AOV} = \\frac{\\text{Total Attributed Revenue}}{\\text{Total Attributed Orders}}',
    sourceTables: ['PosOrder'],
    sourceFields: ['PosOrder.finalAmount', 'PosOrder.id'],
    rule: 'Trung bình số tiền khách chi trả trên mỗi đơn hàng sau khi tham gia workshop.',
    description: 'Quy mô chi tiêu trung bình của một đơn hàng chuyển đổi từ sự kiện.',
    interpretation: 'AOV càng cao thể hiện workshop thu hút được đúng tệp khách hàng tiềm năng hoặc giới thiệu thành công các gói combo lớn.',
  },
  {
    id: 'days_to_convert',
    name: 'Thời gian Chuyển đổi (Days to Convert)',
    symbol: 'Days',
    formulaText: '(Ngày đặt đơn POS - Ngày diễn ra Workshop) tính theo ngày',
    formulaLatex: '\\text{Days} = \\frac{\\text{PosOrder.orderDate} - \\text{Workshop.startsAt}}{86{,}400{,}000 \\text{ ms}}',
    sourceTables: ['PosOrder', 'Workshop'],
    sourceFields: ['PosOrder.orderDate', 'Workshop.startsAt'],
    rule: 'Đo lường khoảng cách thời gian từ lúc tham gia sự kiện đến khi phát sinh đơn mua hàng thực tế.',
    description: 'Số ngày khách hàng cần để cân nhắc, lên công thức và ra quyết định đặt hàng.',
    interpretation: 'Giúp nhận biết chu kỳ chốt đơn phổ biến (7 ngày, 14 ngày hay 30 ngày) để đội ngũ Sales chủ động follow-up đúng thời điểm.',
  },
  {
    id: 'lift_roi',
    name: 'Chỉ số Tăng trưởng ROI (Cohort Lift ROI)',
    symbol: 'Lift (%)',
    formulaText: '((Tỷ lệ mua của nhóm Tham dự - Tỷ lệ mua của nhóm Vắng mặt) / Tỷ lệ mua của nhóm Vắng mặt) × 100%',
    formulaLatex: '\\text{Lift} = \\frac{\\text{CR}_{\\text{Attended}} - \\text{CR}_{\\text{NoShow}}}{\\text{CR}_{\\text{NoShow}}} \\times 100\\%',
    sourceTables: ['WorkshopGuest', 'PosOrder'],
    sourceFields: ['WorkshopGuest.status', 'PosOrder.id'],
    rule: 'So sánh hành vi mua hàng giữa 2 cohort: Nhóm thực tế có mặt (Attended) vs Nhóm đăng ký nhưng vắng mặt (No-show).',
    description: 'Đo lường mức độ tác động gia tăng thuần túy mà buổi workshop đem lại so với việc khách không tham dự.',
    interpretation: 'Nếu Lift dương cao (ví dụ +120%), chứng minh sự kiện thực sự thúc đẩy khách mua hàng vượt trội so với tệp khách chỉ đăng ký suông.',
  },
  {
    id: 'window_attribution',
    name: 'Phân đoạn Cửa sổ Thời gian (Window Attribution)',
    symbol: 'Window (7d/14d/30d/All)',
    formulaText: 'Lọc đơn hàng theo mốc số ngày: orderDate nằm trong khoảng [startsAt, startsAt + N ngày]',
    formulaLatex: '\\text{orderDate} \\in [\\text{startsAt}, \\text{startsAt} + N \\times 86{,}400\\text{s}]',
    sourceTables: ['PosOrder', 'Workshop'],
    sourceFields: ['PosOrder.orderDate', 'Workshop.startsAt'],
    rule: '7 ngày: Chuyển đổi nóng; 14 ngày: Thử mẫu & lên menu; 30 ngày: Chu kỳ nhập hàng tháng; Tất cả: Toàn bộ thời gian.',
    description: 'Bóc tách doanh thu và số lượng đơn hàng theo từng chu kỳ thời gian sau sự kiện.',
    interpretation: 'Cho phép phát hiện thời điểm "vàng" mang lại doanh thu đột phá nhất sau sự kiện.',
  },
];

/**
 * Các interface cấu trúc dữ liệu đầu vào và kết quả
 */
export interface RawWorkshopData {
  id: string;
  title: string;
  slug: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  branch?: string | null;
  guests: Array<{
    id: string;
    phone: string;
    phoneNormalized: string;
    fullName: string;
    status: string; // ATTENDED, REGISTERED, NO_SHOW, CANCELLED
    contactId?: string | null;
  }>;
}

export interface RawPosOrderData {
  id: string;
  posOrderId: number;
  code: string;
  customerPhone?: string | null;
  contactId?: string | null;
  customerName?: string | null;
  branchName?: string | null;
  totalAmount: number;
  finalAmount: number;
  grandTotal: number;
  status: string;
  orderDate: Date;
  items?: Array<{
    id: string;
    posProductId?: number | null;
    productCode?: string | null;
    productName: string;
    quantity: number;
    totalPrice: number;
  }>;
}

export interface AttributedOrderResult {
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  workshopId: string;
  workshopTitle: string;
  workshopDate: string;
  orderDate: string;
  daysToConvert: number;
  finalAmount: number;
  branchName: string;
  guestCohort: 'ATTENDED' | 'NO_SHOW' | 'REGISTERED';
  itemsCount: number;
}

export interface WindowMetric {
  windowDays: number | 'ALL';
  windowLabel: string;
  revenue: number;
  ordersCount: number;
  buyersCount: number;
  aov: number;
  conversionRate: number;
}

export interface WorkshopPerformanceMetric {
  workshopId: string;
  workshopTitle: string;
  workshopSlug: string;
  workshopDate: string;
  branch: string;
  attendedGuests: number;
  noShowGuests: number;
  buyersCount: number;
  ordersCount: number;
  revenue7d: number;
  revenue14d: number;
  revenue30d: number;
  totalRevenue: number;
  conversionRate: number;
  aov: number;
}

export interface TopProductMetric {
  productCode: string;
  productName: string;
  quantitySold: number;
  totalRevenue: number;
  ordersCount: number;
}

export interface ConversionAnalysisResult {
  summary: {
    totalWorkshops: number;
    totalGuests: number;
    totalAttended: number;
    totalNoShow: number;
    totalBuyers: number;
    totalOrders: number;
    totalRevenue: number;
    overallConversionRate: number;
    overallAov: number;
    attendedCr: number;
    noShowCr: number;
    liftRoi: number;
  };
  windowComparison: WindowMetric[];
  workshopComparison: WorkshopPerformanceMetric[];
  attributedOrders: AttributedOrderResult[];
  topProducts: TopProductMetric[];
  dataSources: DataSourceDefinition[];
  formulaDefinitions: FormulaDefinition[];
}

/**
 * 3. Engine Tính toán Quy kết Chuyển đổi (Attribution Engine)
 */
export class WorkshopAttributionEngine {
  /**
   * Tính toán toàn diện số liệu chuyển đổi kinh doanh từ danh sách Workshops và Đơn hàng POS
   */
  public calculate(
    workshops: RawWorkshopData[],
    posOrders: RawPosOrderData[],
    filterWorkshopId?: string,
    filterWindowDays?: number | 'ALL',
  ): ConversionAnalysisResult {
    // 1. Lọc workshops theo yêu cầu
    const activeWorkshops = filterWorkshopId && filterWorkshopId !== 'ALL'
      ? workshops.filter((w) => w.id === filterWorkshopId)
      : workshops;

    // 2. Xây dựng index bản đồ khách mời theo phoneNormalized và contactId
    interface GuestIndexEntry {
      guestId: string;
      fullName: string;
      phone: string;
      phoneNormalized: string;
      status: string;
      workshopId: string;
      workshopTitle: string;
      workshopDate: Date;
    }

    const phoneToGuestsMap = new Map<string, GuestIndexEntry[]>();
    const contactIdToGuestsMap = new Map<string, GuestIndexEntry[]>();

    let totalAttendedGlobal = 0;
    let totalNoShowGlobal = 0;
    let totalGuestsGlobal = 0;

    for (const ws of activeWorkshops) {
      for (const g of ws.guests) {
        totalGuestsGlobal++;
        if (g.status === 'ATTENDED') {
          totalAttendedGlobal++;
        } else {
          totalNoShowGlobal++;
        }

        const entry: GuestIndexEntry = {
          guestId: g.id,
          fullName: g.fullName,
          phone: g.phone,
          phoneNormalized: g.phoneNormalized,
          status: g.status,
          workshopId: ws.id,
          workshopTitle: ws.title,
          workshopDate: ws.startsAt,
        };

        if (g.phoneNormalized) {
          const list = phoneToGuestsMap.get(g.phoneNormalized) || [];
          list.push(entry);
          phoneToGuestsMap.set(g.phoneNormalized, list);
        }

        if (g.contactId) {
          const list = contactIdToGuestsMap.get(g.contactId) || [];
          list.push(entry);
          contactIdToGuestsMap.set(g.contactId, list);
        }
      }
    }

    // 3. Quy kết đơn hàng POS
    const attributedOrders: AttributedOrderResult[] = [];
    const productStatsMap = new Map<string, { code: string; name: string; qty: number; revenue: number; orderIds: Set<string> }>();

    for (const order of posOrders) {
      if (order.status !== 'Completed' && order.status !== 'completed') {
        continue;
      }

      // Tìm khách mời khớp theo phone hoặc contactId
      let matchedGuests: GuestIndexEntry[] = [];
      if (order.contactId && contactIdToGuestsMap.has(order.contactId)) {
        matchedGuests = contactIdToGuestsMap.get(order.contactId)!;
      } else if (order.customerPhone) {
        const norm = order.customerPhone.replace(/\D/g, '');
        // Thử chuẩn hóa số VN
        const e164 = norm.startsWith('84') ? norm : (norm.startsWith('0') ? `84${norm.slice(1)}` : norm);
        if (phoneToGuestsMap.has(e164)) {
          matchedGuests = phoneToGuestsMap.get(e164)!;
        } else if (phoneToGuestsMap.has(norm)) {
          matchedGuests = phoneToGuestsMap.get(norm)!;
        }
      }

      if (matchedGuests.length === 0) continue;

      // Kiểm tra mốc ngày: orderDate >= workshop.startsAt
      for (const guest of matchedGuests) {
        const orderTime = new Date(order.orderDate).getTime();
        const wsTime = new Date(guest.workshopDate).getTime();

        if (orderTime >= wsTime) {
          const diffMs = orderTime - wsTime;
          const daysToConvert = Math.max(0, Math.floor(diffMs / (24 * 3600 * 1000)));

          // Kiểm tra bộ lọc cửa sổ nếu có truyền
          if (typeof filterWindowDays === 'number' && daysToConvert > filterWindowDays) {
            continue;
          }

          const cohortType: 'ATTENDED' | 'NO_SHOW' | 'REGISTERED' =
            guest.status === 'ATTENDED' ? 'ATTENDED' : (guest.status === 'NO_SHOW' ? 'NO_SHOW' : 'REGISTERED');

          attributedOrders.push({
            orderId: order.id,
            orderCode: order.code,
            customerName: order.customerName || guest.fullName,
            customerPhone: order.customerPhone || guest.phone,
            workshopId: guest.workshopId,
            workshopTitle: guest.workshopTitle,
            workshopDate: guest.workshopDate.toISOString(),
            orderDate: new Date(order.orderDate).toISOString(),
            daysToConvert,
            finalAmount: order.finalAmount || order.grandTotal || 0,
            branchName: order.branchName || 'Chi nhánh POS',
            guestCohort: cohortType,
            itemsCount: order.items?.length || 0,
          });

          // Tích lũy sản phẩm bán chạy
          if (order.items) {
            for (const item of order.items) {
              const pCode = item.productCode || `SP-${item.posProductId || 'UNKNOWN'}`;
              const pName = item.productName || pCode;
              const cur = productStatsMap.get(pCode) || { code: pCode, name: pName, qty: 0, revenue: 0, orderIds: new Set<string>() };
              cur.qty += (item.quantity || 1);
              cur.revenue += (item.totalPrice || 0);
              cur.orderIds.add(order.id);
              productStatsMap.set(pCode, cur);
            }
          }
          break; // Mỗi order chỉ quy kết 1 lần cho 1 workshop gần nhất
        }
      }
    }

    // 4. Tính toán số liệu theo 4 mốc Cửa sổ thời gian (7d, 14d, 30d, All)
    const windowConfigs: Array<{ days: number | 'ALL'; label: string }> = [
      { days: 7, label: '7 ngày (Chuyển đổi nóng)' },
      { days: 14, label: '14 ngày (Thử mẫu & lên menu)' },
      { days: 30, label: '30 ngày (Chu kỳ tháng)' },
      { days: 'ALL', label: 'Toàn bộ thời gian' },
    ];

    const windowComparison: WindowMetric[] = windowConfigs.map((cfg) => {
      const ordersInWin = attributedOrders.filter((o) => cfg.days === 'ALL' || o.daysToConvert <= cfg.days);
      const rev = ordersInWin.reduce((sum, o) => sum + o.finalAmount, 0);
      const uniqueBuyers = new Set(ordersInWin.map((o) => o.customerPhone)).size;
      const count = ordersInWin.length;
      const aov = count > 0 ? Math.round(rev / count) : 0;
      const cr = totalAttendedGlobal > 0 ? Math.round((uniqueBuyers / totalAttendedGlobal) * 1000) / 10 : 0;

      return {
        windowDays: cfg.days,
        windowLabel: cfg.label,
        revenue: rev,
        ordersCount: count,
        buyersCount: uniqueBuyers,
        aov,
        conversionRate: cr,
      };
    });

    // 5. Tính toán hiệu quả theo từng Workshop
    const workshopComparison: WorkshopPerformanceMetric[] = activeWorkshops.map((ws) => {
      const wsOrders = attributedOrders.filter((o) => o.workshopId === ws.id);
      const attendedCount = ws.guests.filter((g) => g.status === 'ATTENDED').length;
      const noShowCount = ws.guests.length - attendedCount;

      const rev7d = wsOrders.filter((o) => o.daysToConvert <= 7).reduce((sum, o) => sum + o.finalAmount, 0);
      const rev14d = wsOrders.filter((o) => o.daysToConvert <= 14).reduce((sum, o) => sum + o.finalAmount, 0);
      const rev30d = wsOrders.filter((o) => o.daysToConvert <= 30).reduce((sum, o) => sum + o.finalAmount, 0);
      const totalRev = wsOrders.reduce((sum, o) => sum + o.finalAmount, 0);

      const uniqueBuyers = new Set(wsOrders.map((o) => o.customerPhone)).size;
      const cr = attendedCount > 0 ? Math.round((uniqueBuyers / attendedCount) * 1000) / 10 : 0;
      const aov = wsOrders.length > 0 ? Math.round(totalRev / wsOrders.length) : 0;

      return {
        workshopId: ws.id,
        workshopTitle: ws.title,
        workshopSlug: ws.slug,
        workshopDate: ws.startsAt.toISOString(),
        branch: ws.branch || '—',
        attendedGuests: attendedCount,
        noShowGuests: noShowCount,
        buyersCount: uniqueBuyers,
        ordersCount: wsOrders.length,
        revenue7d: rev7d,
        revenue14d: rev14d,
        revenue30d: rev30d,
        totalRevenue: totalRev,
        conversionRate: cr,
        aov,
      };
    });

    // 6. Tính toán Cohort Lift ROI (Attended vs No-show)
    const attendedOrders = attributedOrders.filter((o) => o.guestCohort === 'ATTENDED');
    const noShowOrders = attributedOrders.filter((o) => o.guestCohort !== 'ATTENDED');

    const attendedBuyers = new Set(attendedOrders.map((o) => o.customerPhone)).size;
    const noShowBuyers = new Set(noShowOrders.map((o) => o.customerPhone)).size;

    const attendedCr = totalAttendedGlobal > 0 ? Math.round((attendedBuyers / totalAttendedGlobal) * 1000) / 10 : 0;
    const noShowCr = totalNoShowGlobal > 0 ? Math.round((noShowBuyers / totalNoShowGlobal) * 1000) / 10 : 0;

    let liftRoi = 0;
    if (noShowCr > 0) {
      liftRoi = Math.round(((attendedCr - noShowCr) / noShowCr) * 100);
    } else if (attendedCr > 0) {
      liftRoi = 100;
    }

    // 7. Top sản phẩm bán chạy
    const topProducts: TopProductMetric[] = Array.from(productStatsMap.values())
      .map((p) => ({
        productCode: p.code,
        productName: p.name,
        quantitySold: p.qty,
        totalRevenue: p.revenue,
        ordersCount: p.orderIds.size,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 15);

    // 8. Tổng quan
    const totalRevAll = attributedOrders.reduce((sum, o) => sum + o.finalAmount, 0);
    const totalBuyersAll = new Set(attributedOrders.map((o) => o.customerPhone)).size;
    const overallCr = totalAttendedGlobal > 0 ? Math.round((totalBuyersAll / totalAttendedGlobal) * 1000) / 10 : 0;
    const overallAov = attributedOrders.length > 0 ? Math.round(totalRevAll / attributedOrders.length) : 0;

    return {
      summary: {
        totalWorkshops: activeWorkshops.length,
        totalGuests: totalGuestsGlobal,
        totalAttended: totalAttendedGlobal,
        totalNoShow: totalNoShowGlobal,
        totalBuyers: totalBuyersAll,
        totalOrders: attributedOrders.length,
        totalRevenue: totalRevAll,
        overallConversionRate: overallCr,
        overallAov: overallAov,
        attendedCr,
        noShowCr,
        liftRoi,
      },
      windowComparison,
      workshopComparison,
      attributedOrders: attributedOrders.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()),
      topProducts,
      dataSources: DATA_SOURCES,
      formulaDefinitions: FORMULA_CATALOG,
    };
  }
}

export const workshopAttributionEngine = new WorkshopAttributionEngine();
