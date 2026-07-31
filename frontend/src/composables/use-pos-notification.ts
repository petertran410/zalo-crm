/**
 * use-pos-notification.ts — Listens to `pos:data:updated` events and displays
 * interactive Toast notifications ("Đã cập nhật dữ liệu POS từ Webhook") with action link.
 */
import { useRouter } from 'vue-router';
import { useToast, type ToastType } from '@/composables/use-toast';
import { usePosSocket, type PosDataUpdatedPayload } from '@/composables/use-pos-socket';

export function usePosNotification(): void {
  const toast = useToast();
  const router = useRouter();

  function handlePosDataUpdated(payload: PosDataUpdatedPayload): void {
    const { type, summary, data } = payload;

    let toastType: ToastType = 'success';
    let actionLabel = 'Xem';
    let targetRoute = '/pos';

    const entityNames: Record<string, string> = {
      order: 'Đơn hàng',
      debt: 'Công nợ',
      inventory: 'Tồn kho',
      customer: 'Khách hàng',
      product: 'Sản phẩm',
    };

    const entityName = entityNames[type] || 'Dữ liệu POS';
    const message = summary || `Đã cập nhật dữ liệu POS từ Webhook (${entityName})`;

    switch (type) {
      case 'order':
        toastType = 'success';
        actionLabel = 'Xem đơn hàng';
        targetRoute = data?.posOrderId || data?.id ? `/pos?tab=orders&id=${data.posOrderId || data.id}` : '/pos?tab=orders';
        break;

      case 'debt':
        toastType = 'warning';
        actionLabel = 'Xem công nợ';
        targetRoute = data?.posCustomerId || data?.customerId ? `/pos?tab=customers&id=${data.posCustomerId || data.customerId}` : '/pos?tab=customers';
        break;

      case 'inventory':
        toastType = (Number(data?.available ?? 10) <= 5) ? 'error' : 'warning';
        actionLabel = 'Xem kho';
        targetRoute = '/pos?tab=inventory';
        break;

      case 'customer':
        toastType = 'default';
        actionLabel = 'Xem khách hàng';
        targetRoute = data?.id ? `/pos?tab=customers&id=${data.id}` : '/pos?tab=customers';
        break;

      case 'product':
        toastType = 'default';
        actionLabel = 'Xem sản phẩm';
        targetRoute = '/pos?tab=products';
        break;
    }

    toast.pushWithAction(
      message,
      {
        label: actionLabel,
        handler: () => {
          if (router) {
            router.push(targetRoute).catch(() => {});
          }
        },
      },
      toastType,
      6000,
    );
  }

  usePosSocket(handlePosDataUpdated);
}
