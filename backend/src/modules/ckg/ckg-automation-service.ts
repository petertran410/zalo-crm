/**
 * ckg-automation-service.ts — Marketing Automation Webhook & Voucher Trigger Service
 * (Milestone 4 §R4)
 *
 * Nhiệm vụ:
 * 1. Nhận diện khách hàng đạt ngưỡng tin cậy cao (score >= 0.80 hoặc tier CONSOLIDATED).
 * 2. Tự động gắn thẻ auto:* (associatedTags) vào Contact.tags và kích hoạt hook onTagAdded.
 * 3. Phát domain event ckg_lead_consolidated lên automationEventBus.
 * 4. Bắn outbound webhook có chữ ký HMAC-SHA256 với SSRF Guard (assertSafeOutboundUrl).
 * 5. Cơ chế Cooldown Guard 7 ngày tránh spam webhook.
 */

import crypto from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { assertSafeOutboundUrl, SsrfBlockedError } from '../../shared/utils/ssrf-guard.js';
import { automationEventBus } from '../../shared/ee-registry/event-bus.js';
import { onTagAdded } from '../../shared/ee-registry/automation.js';
import {
  PersonaCluster,
  PERSONA_CLUSTERS_METADATA,
  ConfidenceTier,
  type ICustomerRadarApiResponse,
} from './ckg-types.js';

export interface IHighConfidenceLeadTriggerInput {
  orgId: string;
  contactId: string;
  radarData: ICustomerRadarApiResponse['data'];
  triggerSource: 'SYNTHESIS' | 'SALE_FEEDBACK';
  customWebhookUrl?: string;
}

export interface IAutomationActionResult {
  qualified: boolean;
  cooldownActive?: boolean;
  autoTagsApplied?: string[];
  webhookDispatched?: boolean;
  eventEmitted?: boolean;
}

export class CkgAutomationService {
  /**
   * Kiểm tra một khách hàng có đạt tiêu chuẩn High-Confidence Lead hay không.
   */
  public isHighConfidence(score: number, tier?: string): boolean {
    return score >= 0.80 || tier === ConfidenceTier.CONSOLIDATED || tier === 'CONSOLIDATED';
  }

  /**
   * Kích hoạt toàn bộ luồng tự động hóa khi khách hàng đạt độ tin cậy cao (>80% hoặc CONSOLIDATED).
   */
  public async handleHighConfidenceLead(
    input: IHighConfidenceLeadTriggerInput
  ): Promise<IAutomationActionResult> {
    const { orgId, contactId, radarData, triggerSource, customWebhookUrl } = input;
    const score = radarData.confidence.score;
    const tier = radarData.confidence.tier;

    // 1. Kiểm tra ngưỡng tin cậy cao
    const qualified = this.isHighConfidence(score, tier);
    if (!qualified) {
      return { qualified: false };
    }

    const personaId = radarData.persona.id as PersonaCluster;

    // 2. Kiểm tra Idempotency Cooldown (Tránh spam webhook/tag nhiều lần trong 7 ngày)
    if (triggerSource === 'SYNTHESIS') {
      const isCooldown = await this.checkCooldown(orgId, contactId, personaId);
      if (isCooldown) {
        logger.debug(
          `[CkgAutomation] Cooldown active for contact ${contactId} and persona ${personaId}. Skipping synthesis triggers.`
        );
        return { qualified: true, cooldownActive: true };
      }
    }

    // 3. Thực hiện đồng thời các tác vụ tự động hóa
    const [tagResult, eventResult, webhookResult] = await Promise.allSettled([
      this.executeAutoTagging(orgId, contactId, personaId),
      this.dispatchDomainEvent(orgId, contactId, radarData),
      this.dispatchOutboundWebhooks(orgId, contactId, radarData, customWebhookUrl),
    ]);

    // Ghi nhận log execution
    await this.recordTriggerExecution(orgId, contactId, personaId);

    const autoTagsApplied = tagResult.status === 'fulfilled' ? tagResult.value : [];
    const eventEmitted = eventResult.status === 'fulfilled' ? eventResult.value : false;
    const webhookDispatched = webhookResult.status === 'fulfilled' ? webhookResult.value > 0 : false;

    return {
      qualified: true,
      cooldownActive: false,
      autoTagsApplied,
      eventEmitted,
      webhookDispatched,
    };
  }

  /**
   * 1. Gắn thẻ tự động (Auto-Tagging) vào Contact.tags và gọi onTagAdded hook.
   */
  public async executeAutoTagging(
    orgId: string,
    contactId: string,
    personaId: PersonaCluster
  ): Promise<string[]> {
    const meta = PERSONA_CLUSTERS_METADATA[personaId];
    if (!meta?.associatedTags || meta.associatedTags.length === 0) return [];

    try {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, orgId },
        select: { id: true, tags: true },
      });

      if (!contact) return [];

      const currentTags: string[] = Array.isArray(contact.tags) ? (contact.tags as string[]) : [];
      const newTagsToAdd = meta.associatedTags.filter((t) => !currentTags.includes(t));

      if (newTagsToAdd.length > 0) {
        const mergedTags = [...currentTags, ...newTagsToAdd];
        await prisma.contact.update({
          where: { id: contactId },
          data: { tags: mergedTags },
        });

        // Kích hoạt open-core hook cho từng thẻ mới
        for (const tag of newTagsToAdd) {
          try {
            await onTagAdded({
              orgId,
              contactId,
              tagKind: 'crmTag',
              tagId: tag,
            });
          } catch (hookErr) {
            logger.debug(`[CkgAutomation] onTagAdded hook warning for tag ${tag}:`, hookErr);
          }
        }
        logger.info(
          `[CkgAutomation] Applied auto tags [${newTagsToAdd.join(', ')}] to contact ${contactId}`
        );
      }

      return newTagsToAdd;
    } catch (err) {
      logger.error(`[CkgAutomation] Error executing auto-tagging for contact ${contactId}:`, err);
      return [];
    }
  }

  /**
   * 2. Phát sự kiện domain event lên automationEventBus.
   */
  public async dispatchDomainEvent(
    orgId: string,
    contactId: string,
    radarData: ICustomerRadarApiResponse['data']
  ): Promise<boolean> {
    try {
      automationEventBus.emit({
        type: 'ckg_lead_consolidated',
        orgId,
        contactId,
        occurredAt: new Date(),
        payload: {
          personaId: radarData.persona.id,
          personaLabel: radarData.persona.label,
          clusterBadge: radarData.persona.clusterBadge,
          confidenceScore: radarData.confidence.score,
          confidenceTier: radarData.confidence.tier,
          suggestedVoucher: radarData.nextBestAction.suggestedVoucher,
          suggestedProducts: radarData.nextBestAction.suggestedProducts,
          nbaScript: radarData.nextBestAction.scriptText,
        },
      });
      return true;
    } catch (err) {
      logger.error('[CkgAutomation] Error emitting domain event ckg_lead_consolidated:', err);
      return false;
    }
  }

  /**
   * 3. Bắn Webhook ra hệ thống Marketing bên ngoài (Zapier / Marketing Hub) có chữ ký HMAC và SSRF Guard.
   */
  public async dispatchOutboundWebhooks(
    orgId: string,
    contactId: string,
    radarData: ICustomerRadarApiResponse['data'],
    explicitWebhookUrl?: string
  ): Promise<number> {
    const urlsToDispatch: string[] = [];

    // Nếu truyền URL trực tiếp
    if (explicitWebhookUrl) {
      urlsToDispatch.push(explicitWebhookUrl);
    }

    // Nếu cấu hình biến môi trường
    const envWebhookUrl = process.env.CKG_MARKETING_WEBHOOK_URL;
    if (envWebhookUrl && !urlsToDispatch.includes(envWebhookUrl)) {
      urlsToDispatch.push(envWebhookUrl);
    }

    // Tìm các trigger webhook đang kích hoạt trong org
    try {
      const webhookTriggers = await prisma.automationTrigger.findMany({
        where: {
          orgId,
          enabled: true,
          category: { in: ['bot_api', 'general', 'marketing'] },
          eventType: { in: ['ckg_high_confidence', 'ckg_lead_consolidated', 'persona_qualified'] },
        },
      });

      for (const trigger of webhookTriggers) {
        const filter = trigger.eventFilter as Record<string, unknown> | null;
        const targetUrl = (filter?.webhookUrl || filter?.targetUrl) as string | undefined;
        if (targetUrl && typeof targetUrl === 'string' && !urlsToDispatch.includes(targetUrl)) {
          urlsToDispatch.push(targetUrl);
        }
      }
    } catch (dbErr) {
      logger.debug('[CkgAutomation] Error fetching automationTriggers for webhooks:', dbErr);
    }

    if (urlsToDispatch.length === 0) {
      return 0;
    }

    const payload = {
      event: 'ckg.lead.high_confidence',
      orgId,
      timestamp: new Date().toISOString(),
      contact: {
        id: contactId,
        fullName: radarData.contactMetadata?.fullName,
        phone: radarData.contactMetadata?.phone,
        status: radarData.contactMetadata?.status,
      },
      radar: {
        personaId: radarData.persona.id,
        personaLabel: radarData.persona.label,
        clusterBadge: radarData.persona.clusterBadge,
        confidenceScore: radarData.confidence.score,
        confidenceTier: radarData.confidence.tier,
        suggestedVoucher: radarData.nextBestAction.suggestedVoucher,
        voucherRationale: radarData.nextBestAction.voucherRationale,
        suggestedProducts: radarData.nextBestAction.suggestedProducts,
        nbaScript: radarData.nextBestAction.scriptText,
      },
    };

    const payloadString = JSON.stringify(payload);
    const secret = process.env.CKG_WEBHOOK_SECRET || 'crm-ckg-secret-key';
    const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

    let dispatchedCount = 0;

    for (const targetUrl of urlsToDispatch) {
      // Bảo mật SSRF: Chặn loopback, private RFC1918, link-local metadata
      try {
        assertSafeOutboundUrl(targetUrl);
      } catch (ssrfErr) {
        logger.warn(`[CkgAutomation] Blocked unsafe SSRF webhook URL: ${targetUrl}`, ssrfErr);
        continue;
      }

      try {
        await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CKG-Signature': `sha256=${signature}`,
            'X-CKG-Event': 'ckg.lead.high_confidence',
          },
          body: payloadString,
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
        dispatchedCount++;
      } catch (httpErr) {
        logger.warn(`[CkgAutomation] Webhook HTTP dispatch error to ${targetUrl}:`, httpErr);
      }
    }

    return dispatchedCount;
  }

  /**
   * 4. Cooldown 7 ngày kiểm tra tránh spam trigger
   */
  public async checkCooldown(orgId: string, contactId: string, personaId: string): Promise<boolean> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentLog = await prisma.automationEventLog.findFirst({
        where: {
          orgId,
          contactId,
          eventType: 'CKG_HIGH_CONFIDENCE_QUALIFIED',
          summary: { contains: personaId },
          createdAt: { gte: sevenDaysAgo },
        },
      });
      return Boolean(recentLog);
    } catch {
      return false;
    }
  }

  /**
   * 5. Ghi log kích hoạt vào bảng automation_event_log
   */
  public async recordTriggerExecution(
    orgId: string,
    contactId: string,
    personaId: string
  ): Promise<void> {
    try {
      await prisma.automationEventLog.create({
        data: {
          orgId,
          contactId,
          eventType: 'CKG_HIGH_CONFIDENCE_QUALIFIED',
          eventPriority: 'info',
          summary: `Qualified high-confidence lead for persona ${personaId}`,
          detail: `Automated CKG trigger fired for persona cluster: ${personaId}`,
          metadata: {
            personaId,
            triggeredAt: new Date().toISOString(),
          },
        },
      });
    } catch (err) {
      logger.debug('[CkgAutomation] Non-critical error recording event log:', err);
    }
  }
}

export const ckgAutomationService = new CkgAutomationService();
