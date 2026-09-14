import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { workshopApiClient } from './workshop-api-client.js';
import { workshopAttributionEngine } from './workshop-attribution-engine.js';

export class WorkshopService {
  /**
   * Lấy trạng thái cấu hình & kết nối
   */
  public async getStatus() {
    const clientStatus = workshopApiClient.getStatus();
    let health: { ok: boolean; message: string } = { ok: false, message: 'Chưa kiểm tra' };
    if (clientStatus.configured) {
      const conn = await workshopApiClient.testConnection();
      health = { ok: conn.ok, message: conn.message || (conn.ok ? 'Kết nối OK' : 'Lỗi kết nối') };
    }
    return {
      ...clientStatus,
      health,
    };
  }

  /**
   * Đồng bộ danh sách Workshops từ API ngoài vào Database CRM (Master sync)
   */
  public async syncWorkshops(orgId: string): Promise<{ success: boolean; syncedCount: number; message: string }> {
    if (!workshopApiClient.isConfigured()) {
      throw new Error('Chưa cấu hình WORKSHOP_API_BASE_URL hoặc WORKSHOP_API_KEY');
    }

    logger.info(`[workshop-service] Bắt đầu đồng bộ danh sách Workshops cho org: ${orgId}`);
    let page = 1;
    let hasMore = true;
    const items: any[] = [];

    while (hasMore) {
      const response = await workshopApiClient.fetchWorkshops({ page, per_page: 100 });
      const batch = response.data || [];
      items.push(...batch);

      const totalPages = response.meta?.total_pages ?? 1;
      if (page >= totalPages || batch.length === 0) {
        hasMore = false;
      } else {
        page++;
      }
    }

    let count = 0;
    const dbWorkshop = (prisma as any).workshop;

    for (const item of items) {
      const slug = item.slug || `workshop-${item.id}`;
      const title = item.title || item.name || 'Workshop không tên';

      let startsAt = new Date();
      if (item.event_date) {
        const timePart = item.event_time ? (String(item.event_time).length === 5 ? `${item.event_time}:00` : String(item.event_time)) : '08:00:00';
        startsAt = new Date(`${item.event_date}T${timePart}`);
      } else if (item.starts_at || item.startsAt) {
        startsAt = new Date((item.starts_at || item.startsAt) as string);
      }

      const endsAt = item.ends_at || item.endsAt
        ? new Date((item.ends_at || item.endsAt) as string)
        : new Date(startsAt.getTime() + 4 * 3600 * 1000);

      const extraInfo = [
        item.branch ? `Chi nhánh: ${item.branch}` : '',
        item.zalo_group_url ? `Nhóm Zalo: ${item.zalo_group_url}` : '',
        item.maps_url ? `Bản đồ: ${item.maps_url}` : '',
      ].filter(Boolean).join(' • ');

      const description = (item.description as string) || extraInfo || null;

      await dbWorkshop.upsert({
        where: {
          orgId_slug: {
            orgId,
            slug,
          },
        },
        update: {
          externalId: item.id ? String(item.id) : undefined,
          title,
          description,
          location: item.location || null,
          startsAt,
          endsAt,
          capacity: typeof item.capacity === 'number' ? item.capacity : 0,
          status: (item.status as string || 'OPEN').toUpperCase(),
          bannerUrl: (item.banner_url || item.bannerUrl) as string || null,
          metadata: item as any,
          updatedAt: new Date(),
        },
        create: {
          orgId,
          externalId: item.id ? String(item.id) : undefined,
          slug,
          title,
          description,
          location: item.location || null,
          startsAt,
          endsAt,
          capacity: typeof item.capacity === 'number' ? item.capacity : 0,
          status: (item.status as string || 'OPEN').toUpperCase(),
          bannerUrl: (item.banner_url || item.bannerUrl) as string || null,
          metadata: item as any,
        },
      });
      count++;
    }

    logger.info(`[workshop-service] Đã đồng bộ thành công ${count} workshops`);
    return {
      success: true,
      syncedCount: count,
      message: `Đã đồng bộ thành công ${count} workshops từ hệ thống ngoài`,
    };
  }

  /**
   * Kéo và đối soát danh sách khách mời của 1 workshop (Lazy sync)
   */
  public async syncWorkshopGuests(orgId: string, workshopId: string): Promise<{ success: boolean; syncedCount: number; linkedCount: number; message: string }> {
    if (!workshopApiClient.isConfigured()) {
      throw new Error('Chưa cấu hình WORKSHOP_API_BASE_URL hoặc WORKSHOP_API_KEY');
    }

    const dbWorkshop = (prisma as any).workshop;
    const dbWorkshopGuest = (prisma as any).workshopGuest;

    const workshop = await dbWorkshop.findFirst({
      where: { id: workshopId, orgId },
    });

    if (!workshop) {
      throw new Error('Không tìm thấy workshop trong hệ thống CRM');
    }

    const externalIdentifier = workshop.externalId || workshop.slug || workshop.id;
    logger.info(`[workshop-service] Bắt đầu đồng bộ khách mời cho workshop: ${workshop.title} (${externalIdentifier})`);

    let guestPage = 1;
    let guestHasMore = true;
    const guestItems: any[] = [];

    while (guestHasMore) {
      const response = await workshopApiClient.fetchWorkshopGuests(externalIdentifier, { page: guestPage, per_page: 100 });
      const batch = response.data || [];
      guestItems.push(...batch);

      const totalPages = response.meta?.total_pages ?? 1;
      if (guestPage >= totalPages || batch.length === 0) {
        guestHasMore = false;
      } else {
        guestPage++;
      }
    }

    let count = 0;
    let linkedCount = 0;

    for (const item of guestItems) {
      const rawPhone = item.phone || '';
      if (!rawPhone) continue;

      const normalized = normalizePhone(rawPhone);
      if (!normalized) continue;

      // Đối soát với Contact trong CRM
      // 1. Khớp phoneNormalized chính
      let contact = await prisma.contact.findFirst({
        where: {
          orgId,
          phoneNormalized: normalized,
        },
        select: { id: true, fullName: true, phone: true },
      });

      // 2. Khớp phone2 hoặc phone3 nếu chưa tìm thấy
      if (!contact) {
        contact = await prisma.contact.findFirst({
          where: {
            orgId,
            OR: [
              { phone2: rawPhone },
              { phone3: rawPhone },
            ],
          },
          select: { id: true, fullName: true, phone: true },
        });
      }

      const fullName = item.full_name || item.fullName || item.name || 'Khách đăng ký';

      let status = 'REGISTERED';
      if (item.checkin_status === 'checked_in' || item.checked_in_at) {
        status = 'ATTENDED';
      } else if (item.registration_status === 'cancelled') {
        status = 'CANCELLED';
      } else if (item.status) {
        status = String(item.status).toUpperCase();
      }

      const qrCode = item.checkin_qr_code || item.checkinQrCode || item.qr_code || null;
      const registeredAt = item.registered_at || item.registeredAt ? new Date(item.registered_at || item.registeredAt as string) : new Date();
      const checkedInAt = item.checked_in_at || item.checkedInAt ? new Date(item.checked_in_at || item.checkedInAt as string) : null;
      const partySize = typeof (item.party_size ?? item.partySize) === 'number' ? Number(item.party_size ?? item.partySize) : 1;

      const source = (item.business_model as string) || (item.source as string) || null;
      const extraNotes = [
        item.company ? `Đơn vị: ${item.company}` : '',
        item.role_title ? `Vai trò: ${item.role_title}` : '',
        item.business_model ? `Mô hình: ${item.business_model}` : '',
        item.notes ? `Ghi chú: ${item.notes}` : '',
      ].filter(Boolean).join(' • ');
      const notes = extraNotes || (item.notes as string) || null;

      if (contact) {
        linkedCount++;
      }

      await dbWorkshopGuest.upsert({
        where: {
          workshopId_phoneNormalized: {
            workshopId,
            phoneNormalized: normalized,
          },
        },
        update: {
          contactId: contact ? contact.id : undefined,
          externalGuestId: item.id ? String(item.id) : undefined,
          fullName,
          phone: rawPhone,
          email: item.email || null,
          partySize,
          status,
          checkinQrCode: qrCode,
          registeredAt,
          checkedInAt,
          source,
          notes,
          updatedAt: new Date(),
        },
        create: {
          orgId,
          workshopId,
          contactId: contact ? contact.id : null,
          externalGuestId: item.id ? String(item.id) : undefined,
          fullName,
          phone: rawPhone,
          phoneNormalized: normalized,
          email: item.email || null,
          partySize,
          status,
          checkinQrCode: qrCode,
          registeredAt,
          checkedInAt,
          source,
          notes,
        },
      });

      count++;
    }

    logger.info(`[workshop-service] Đã đồng bộ ${count} khách mời (${linkedCount} đã khớp Contact CRM)`);
    return {
      success: true,
      syncedCount: count,
      linkedCount,
      message: `Đã cập nhật ${count} khách mời, trong đó ${linkedCount} khách đã khớp với Contact CRM`,
    };
  }

  /**
   * Lấy danh sách Workshops lưu trong Database CRM (kèm số lượng khách)
   */
  public async getWorkshops(orgId: string) {
    const dbWorkshop = (prisma as any).workshop;
    const workshops = await dbWorkshop.findMany({
      where: { orgId },
      orderBy: { startsAt: 'desc' },
      include: {
        _count: {
          select: { guests: true },
        },
      },
    });

    return workshops.map((w: any) => ({
      id: w.id,
      externalId: w.externalId,
      slug: w.slug,
      title: w.title,
      description: w.description,
      location: w.location,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      capacity: w.capacity,
      status: w.status,
      bannerUrl: w.bannerUrl,
      guestCount: w._count?.guests ?? 0,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      metadata: w.metadata,
    }));
  }

  /**
   * Lấy chi tiết 1 Workshop kèm toàn bộ danh sách khách mời đã sync
   */
  public async getWorkshopDetail(orgId: string, workshopId: string) {
    const dbWorkshop = (prisma as any).workshop;
    const workshop = await dbWorkshop.findFirst({
      where: { id: workshopId, orgId },
      include: {
        guests: {
          orderBy: { registeredAt: 'desc' },
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                avatarUrl: true,
                zaloUid: true,
              },
            },
          },
        },
      },
    });

    if (!workshop) {
      throw new Error('Không tìm thấy workshop');
    }

    const guests = workshop.guests || [];
    const totalGuests = guests.length;
    const attendedCount = guests.filter((g: any) => g.status === 'ATTENDED').length;
    const registeredCount = guests.filter((g: any) => g.status === 'REGISTERED').length;
    const noShowCount = guests.filter((g: any) => g.status === 'NO_SHOW').length;
    const linkedCount = guests.filter((g: any) => g.contactId != null).length;

    return {
      workshop: {
        id: workshop.id,
        externalId: workshop.externalId,
        slug: workshop.slug,
        title: workshop.title,
        description: workshop.description,
        location: workshop.location,
        startsAt: workshop.startsAt,
        endsAt: workshop.endsAt,
        capacity: workshop.capacity,
        status: workshop.status,
        bannerUrl: workshop.bannerUrl,
        metadata: workshop.metadata,
        createdAt: workshop.createdAt,
        updatedAt: workshop.updatedAt,
      },
      stats: {
        totalGuests,
        attendedCount,
        registeredCount,
        noShowCount,
        linkedCount,
        attendanceRate: totalGuests > 0 ? Math.round((attendedCount / totalGuests) * 100) : 0,
      },
      guests: guests.map((g: any) => ({
        id: g.id,
        fullName: g.fullName,
        phone: g.phone,
        phoneNormalized: g.phoneNormalized,
        email: g.email,
        partySize: g.partySize,
        status: g.status,
        checkinQrCode: g.checkinQrCode,
        registeredAt: g.registeredAt,
        checkedInAt: g.checkedInAt,
        source: g.source,
        notes: g.notes,
        contact: g.contact ? {
          id: g.contact.id,
          fullName: g.contact.fullName,
          phone: g.contact.phone,
          avatarUrl: g.contact.avatarUrl,
        } : null,
      })),
    };
  }

  /**
   * Lấy nhật ký check-in từ server ngoài theo workshop_id và làm giàu thông tin khách mời
   */
  public async getCheckinLogs(orgId: string, query: { workshop_id?: string; page?: number; per_page?: number }) {
    let externalWorkshopId = query.workshop_id;

    // Nếu truyền vào internal workshopId (UUID trong CRM), tìm externalId tương ứng
    if (externalWorkshopId) {
      const dbWorkshop = (prisma as any).workshop;
      const found = await dbWorkshop.findFirst({
        where: {
          orgId,
          OR: [
            { id: externalWorkshopId },
            { externalId: externalWorkshopId },
            { slug: externalWorkshopId },
          ],
        },
        select: { id: true, externalId: true, title: true, slug: true },
      });
      if (found) {
        externalWorkshopId = found.externalId || found.id;
      }
    } else {
      // Mặc định tìm workshop đầu tiên có externalId
      const dbWorkshop = (prisma as any).workshop;
      const firstWithExternal = await dbWorkshop.findFirst({
        where: {
          orgId,
          externalId: { not: null },
        },
        orderBy: { startsAt: 'desc' },
        select: { id: true, externalId: true, title: true, slug: true },
      });
      if (firstWithExternal) {
        externalWorkshopId = firstWithExternal.externalId || firstWithExternal.id;
      }
    }

    if (!externalWorkshopId) {
      return { data: [], meta: { page: 1, per_page: 50, total: 0, total_pages: 0 }, error: null };
    }

    const res = await workshopApiClient.fetchCheckinLogs({
      workshop_id: externalWorkshopId,
      page: query.page,
      per_page: query.per_page,
    });

    const rawLogs = (res.data || []) as any[];
    if (rawLogs.length === 0) {
      return res;
    }

    // Làm giàu dữ liệu: Lấy danh sách guest_id để truy vấn tên khách trong CRM
    const guestIds = rawLogs.map((l: any) => l.guest_id).filter(Boolean);
    const dbWorkshopGuest = (prisma as any).workshopGuest;
    const guests = await dbWorkshopGuest.findMany({
      where: {
        orgId,
        OR: [
          { externalGuestId: { in: guestIds } },
          { id: { in: guestIds } },
        ],
      },
      select: {
        id: true,
        externalGuestId: true,
        fullName: true,
        phone: true,
        partySize: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });

    const guestMap = new Map<string, any>();
    for (const g of guests) {
      if (g.externalGuestId) guestMap.set(g.externalGuestId, g);
      guestMap.set(g.id, g);
    }

    const enrichedLogs = rawLogs.map((l: any) => {
      const g = guestMap.get(l.guest_id);
      return {
        id: l.id,
        workshopId: l.workshop_id,
        guestId: l.guest_id,
        guestName: g?.fullName || 'Khách tham dự',
        guestPhone: g?.phone || null,
        guestPartySize: g?.partySize ?? 1,
        contact: g?.contact || null,
        status: l.status || 'checked_in',
        method: l.method || 'admin',
        checkedInBy: l.checked_in_by || l.method || 'Hệ thống',
        checkedInAt: l.checked_in_at || l.scanned_at || l.created_at,
        note: l.note || null,
      };
    });

    return {
      data: enrichedLogs,
      meta: res.meta,
      error: res.error,
    };
  }

  /**
   * Lấy danh sách các Biểu mẫu Đăng ký (Forms) từ các workshop
   */
  public async getRegistrationForms(orgId: string) {
    const dbWorkshop = (prisma as any).workshop;
    const workshops = await dbWorkshop.findMany({
      where: { orgId },
      select: {
        id: true,
        title: true,
        slug: true,
        metadata: true,
      },
    });

    const formsMap = new Map<string, any>();

    for (const w of workshops) {
      const meta = (w.metadata || {}) as any;
      const shortUrl = meta.registration_short_url as string | undefined;
      if (!shortUrl) continue;

      // Trích xuất token từ URL nếu có dạng: .../register/{token}
      const match = shortUrl.match(/\/register\/([a-zA-Z0-9_-]+)/);
      const token = match ? match[1] : null;

      if (token && !formsMap.has(token)) {
        formsMap.set(token, {
          token,
          workshopTitle: w.title,
          workshopSlug: w.slug,
          registrationUrl: shortUrl,
          isOfficialToken: true,
        });
      } else if (!token && !formsMap.has(shortUrl)) {
        formsMap.set(shortUrl, {
          token: shortUrl,
          workshopTitle: w.title,
          workshopSlug: w.slug,
          registrationUrl: shortUrl,
          isOfficialToken: false,
        });
      }
    }

    // Truy vấn chi tiết form từ API ngoài cho các token chính thức
    const results: any[] = [];
    for (const [, item] of formsMap.entries()) {
      if (item.isOfficialToken) {
        try {
          const formRes = await workshopApiClient.fetchRegistrationForm(item.token);
          if (formRes.data) {
            results.push({
              token: item.token,
              title: formRes.data.workshop_name || item.workshopTitle,
              greeting: formRes.data.greeting || null,
              isActive: Boolean(formRes.data.is_active),
              workshopId: formRes.data.workshop_id,
              eventDate: formRes.data.workshop_event_date || null,
              location: formRes.data.workshop_location || null,
              registrationUrl: item.registrationUrl,
              workshops: formRes.data.workshops || [],
            });
            continue;
          }
        } catch {
          // Fallback nếu API ngoài báo lỗi
        }
      }

      results.push({
        token: item.token,
        title: item.workshopTitle,
        greeting: null,
        isActive: true,
        workshopId: null,
        eventDate: null,
        location: null,
        registrationUrl: item.registrationUrl,
        workshops: [],
      });
    }

    return results;
  }

  /**
   * Lấy chi tiết 1 form đăng ký qua token
   */
  public async getRegistrationFormDetail(token: string) {
    return workshopApiClient.fetchRegistrationForm(token);
  }

  /**
   * Tra cứu khách mời qua server ngoài (yêu cầu workshop_slug và phone hoặc email)
   */
  public async lookupGuests(query: Record<string, string | number>) {
    if (!query.workshop_slug) {
      throw new Error('Tham số workshop_slug là bắt buộc khi tra cứu khách mời');
    }
    if (!query.phone && !query.email) {
      throw new Error('Vui lòng cung cấp số điện thoại hoặc email để tra cứu');
    }
    return workshopApiClient.lookupGuests(query);
  }

  /**
   * Thực hiện check-in cho khách
   */
  public async performCheckin(data: { qr_code?: string; guest_id?: string; workshop_id?: string }, idempotencyKey?: string) {
    return workshopApiClient.performCheckin(data, idempotencyKey);
  }

  /**
   * Phân tích Chuyển đổi Kinh doanh Workshop ↔ POS (Phase 3)
   */
  public async getSalesConversionAnalysis(orgId: string, params?: { workshopId?: string; windowDays?: number | 'ALL' }) {
    const dbWorkshop = (prisma as any).workshop;
    const dbPosOrder = (prisma as any).posOrder;

    // Lấy danh sách Workshop và Khách mời
    const workshops = await dbWorkshop.findMany({
      where: { orgId },
      orderBy: { startsAt: 'desc' },
      include: {
        guests: {
          select: {
            id: true,
            phone: true,
            phoneNormalized: true,
            fullName: true,
            status: true,
            contactId: true,
          },
        },
      },
    });

    // Lấy danh sách Đơn hàng POS kèm Items
    const posOrders = await dbPosOrder.findMany({
      where: { orgId },
      orderBy: { orderDate: 'desc' },
      include: {
        items: {
          select: {
            id: true,
            posProductId: true,
            productCode: true,
            productName: true,
            quantity: true,
            totalPrice: true,
          },
        },
      },
    });

    const rawWorkshops = workshops.map((w: any) => ({
      id: w.id,
      title: w.title,
      slug: w.slug,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      location: w.location,
      branch: w.metadata?.branch || null,
      guests: (w.guests || []).map((g: any) => ({
        id: g.id,
        phone: g.phone,
        phoneNormalized: g.phoneNormalized,
        fullName: g.fullName,
        status: g.status,
        contactId: g.contactId,
      })),
    }));

    const rawOrders = posOrders.map((o: any) => ({
      id: o.id,
      posOrderId: o.posOrderId,
      code: o.code,
      customerPhone: o.customerPhone,
      contactId: o.contactId,
      customerName: o.customerName,
      branchName: o.branchName,
      totalAmount: o.totalAmount || 0,
      finalAmount: o.finalAmount || o.grandTotal || 0,
      grandTotal: o.grandTotal || 0,
      status: o.status,
      orderDate: o.orderDate,
      items: (o.items || []).map((i: any) => ({
        id: i.id,
        posProductId: i.posProductId,
        productCode: i.productCode,
        productName: i.productName,
        quantity: i.quantity || 1,
        totalPrice: i.totalPrice || 0,
      })),
    }));

    return workshopAttributionEngine.calculate(
      rawWorkshops,
      rawOrders,
      params?.workshopId,
      params?.windowDays,
    );
  }
}

export const workshopService = new WorkshopService();
