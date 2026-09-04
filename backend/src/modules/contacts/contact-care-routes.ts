/**
 * Contact care fields — append-only notes for products, workshops, and complaints.
 * The drawer uses one current value per category, while the API retains every change.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { assertContactEditable, assertContactVisible } from './contact-scope.js';
import { logger } from '../../shared/utils/logger.js';

const MAX_VALUE_LENGTH = 5000;

type CareBody = {
  productInterest?: unknown;
  workshopsAttended?: unknown;
  complaints?: unknown;
};

function cleanValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length <= MAX_VALUE_LENGTH ? trimmed : undefined;
}

function invalidValue(value: unknown): boolean {
  return value !== undefined && (typeof value !== 'string' || value.trim().length > MAX_VALUE_LENGTH);
}

async function getContactForCare(request: FastifyRequest, reply: FastifyReply, editable: boolean) {
  const user = request.user!;
  const { contactId } = request.params as { contactId: string };
  const visible = await assertContactVisible({
    userId: user.id,
    orgId: user.orgId,
    legacyRole: user.role,
    contactId,
  });
  if (!visible) {
    reply.status(404).send({ error: 'Contact not found' });
    return null;
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    select: { id: true },
  });
  if (!contact) {
    reply.status(404).send({ error: 'Contact not found' });
    return null;
  }

  if (editable) {
    try {
      await assertContactEditable({
        userId: user.id,
        orgId: user.orgId,
        legacyRole: user.role,
        contactId,
      });
    } catch (err: any) {
      reply.status(err?.statusCode ?? 403).send({
        error: err?.code || 'CONTACT_EDIT_FORBIDDEN',
        message: err?.message || 'Không có quyền sửa KH này',
      });
      return null;
    }
  }

  return { user, contactId };
}

function careResponse(
  productInterests: Array<{ id: string; value: string; createdByUserId: string | null; createdAt: Date }>,
  workshopsAttended: Array<{ id: string; value: string; attendedAt: Date | null; createdByUserId: string | null; createdAt: Date }>,
  complaints: Array<{ id: string; value: string; createdByUserId: string | null; createdAt: Date }>,
) {
  const currentValue = <T extends { value: string }>(rows: T[]) => rows[0]?.value ?? '';
  return {
    productInterests,
    workshopsAttended,
    complaints,
    current: {
      productInterest: currentValue(productInterests),
      workshopsAttended: currentValue(workshopsAttended),
      complaints: currentValue(complaints),
    },
  };
}

export async function contactCareRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/contacts/:contactId/care-fields', async (request, reply) => {
    try {
      const context = await getContactForCare(request, reply, false);
      if (!context) return;
      const { user, contactId } = context;
      const [productInterests, workshopsAttended, complaints] = await Promise.all([
        prisma.contactProductInterest.findMany({
          where: { orgId: user.orgId, contactId, value: { not: '' } },
          select: { id: true, value: true, createdByUserId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.contactWorkshopAttendance.findMany({
          where: { orgId: user.orgId, contactId, value: { not: '' } },
          select: { id: true, value: true, attendedAt: true, createdByUserId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.contactComplaint.findMany({
          where: { orgId: user.orgId, contactId, value: { not: '' } },
          select: { id: true, value: true, createdByUserId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      // Empty latest records are tombstones used to clear the simple V1 input.
      const [latestProduct, latestWorkshop, latestComplaint] = await Promise.all([
        prisma.contactProductInterest.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } }),
        prisma.contactWorkshopAttendance.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } }),
        prisma.contactComplaint.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } }),
      ]);
      return {
        ...careResponse(productInterests, workshopsAttended, complaints),
        current: {
          productInterest: latestProduct?.value ?? '',
          workshopsAttended: latestWorkshop?.value ?? '',
          complaints: latestComplaint?.value ?? '',
        },
      };
    } catch (err) {
      logger.error('[contacts] Care fields list error:', err);
      return reply.status(500).send({ error: 'Failed to fetch care fields' });
    }
  });

  app.put('/api/v1/contacts/:contactId/care-fields', async (request, reply) => {
    try {
      const context = await getContactForCare(request, reply, true);
      if (!context) return;
      const { user, contactId } = context;
      const body = (request.body ?? {}) as CareBody;
      if (invalidValue(body.productInterest) || invalidValue(body.workshopsAttended) || invalidValue(body.complaints)) {
        return reply.status(400).send({ error: 'Care field must be a string of at most 5000 characters' });
      }
      const productInterest = cleanValue(body.productInterest);
      const workshopsAttended = cleanValue(body.workshopsAttended);
      const complaints = cleanValue(body.complaints);

      await prisma.$transaction(async (tx) => {
        if (productInterest !== undefined) {
          const latest = await tx.contactProductInterest.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } });
          if (latest?.value !== productInterest) {
            await tx.contactProductInterest.create({ data: { orgId: user.orgId, contactId, value: productInterest, createdByUserId: user.id } });
          }
        }
        if (workshopsAttended !== undefined) {
          const latest = await tx.contactWorkshopAttendance.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } });
          if (latest?.value !== workshopsAttended) {
            await tx.contactWorkshopAttendance.create({ data: { orgId: user.orgId, contactId, value: workshopsAttended, createdByUserId: user.id } });
          }
        }
        if (complaints !== undefined) {
          const latest = await tx.contactComplaint.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } });
          if (latest?.value !== complaints) {
            await tx.contactComplaint.create({ data: { orgId: user.orgId, contactId, value: complaints, createdByUserId: user.id } });
          }
        }
      });

      // Reuse the read path's response shape after the transaction, preserving append history.
      const [savedProductInterests, savedWorkshopsAttended, savedComplaints] = await Promise.all([
        prisma.contactProductInterest.findMany({ where: { orgId: user.orgId, contactId, value: { not: '' } }, select: { id: true, value: true, createdByUserId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
        prisma.contactWorkshopAttendance.findMany({ where: { orgId: user.orgId, contactId, value: { not: '' } }, select: { id: true, value: true, attendedAt: true, createdByUserId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
        prisma.contactComplaint.findMany({ where: { orgId: user.orgId, contactId, value: { not: '' } }, select: { id: true, value: true, createdByUserId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      ]);
      return careResponse(savedProductInterests, savedWorkshopsAttended, savedComplaints);
    } catch (err) {
      logger.error('[contacts] Care fields update error:', err);
      return reply.status(500).send({ error: 'Failed to update care fields' });
    }
  });
}
