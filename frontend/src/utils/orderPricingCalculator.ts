import type { CartItem } from '@/components/order-builder/types';

/**
 * OOP Class `OrderPricingCalculator`
 * Centralized business logic & formula engine for POS order pricing calculations.
 * 
 * Rules:
 * - Per-Unit Discount = Chiết khấu/giảm giá trên TỪNG ĐƠN VỊ sản phẩm (VNĐ)
 * - Effective Unit Price (Đơn giá thực tế) = Base Price (Giá niêm yết) - Per-Unit Discount
 * - Line Total (Thành tiền) = Effective Unit Price * Quantity = (Base Price - Per-Unit Discount) * Quantity
 * - Total Line Discount = Per-Unit Discount * Quantity
 */
export class OrderPricingCalculator {
  /**
   * Calculate effective unit price of an item for display on invoice & cart:
   * Effective Unit Price = Base Price - Per-Unit Discount
   */
  public static calculateEffectiveUnitPrice(basePrice: number, perUnitDiscount = 0): number {
    return Math.max(0, basePrice - (perUnitDiscount || 0));
  }

  /**
   * Calculate total line discount amount across all quantities of an item:
   * Total Line Discount = Per-Unit Discount * Quantity
   */
  public static calculateTotalLineDiscount(perUnitDiscount = 0, quantity = 1): number {
    const qty = Math.max(1, quantity);
    return Math.max(0, (perUnitDiscount || 0) * qty);
  }

  /**
   * Calculate line total for a cart item:
   * Line Total = Effective Unit Price * Quantity = (Base Price - Per-Unit Discount) * Quantity
   */
  public static calculateLineTotal(basePrice: number, quantity: number, perUnitDiscount = 0, isGift = false): number {
    if (isGift) return 0;
    const qty = Math.max(1, quantity);
    const effectiveUnitPrice = this.calculateEffectiveUnitPrice(basePrice, perUnitDiscount);
    return Math.max(0, effectiveUnitPrice * qty);
  }

  /**
   * Derive per-unit discount when user inputs a target unit price directly on invoice:
   * - If targetUnitPrice < basePrice: Per-Unit Discount = basePrice - targetUnitPrice
   * - If targetUnitPrice >= basePrice: Per-Unit Discount = 0
   */
  public static derivePerUnitDiscountFromTargetPrice(basePrice: number, targetUnitPrice: number): number {
    const validTargetPrice = Math.max(0, targetUnitPrice);
    if (validTargetPrice < basePrice) {
      return Math.round(basePrice - validTargetPrice);
    }
    return 0;
  }

  /**
   * Calculate per-unit discount from user input (flat amount or percentage of unit base price)
   * Example: Base Price = 93,000. Flat discount = 10,000 -> Per-Unit Discount = 10,000.
   * Example: Base Price = 100,000. 10% discount -> Per-Unit Discount = 10,000.
   */
  public static calculatePerUnitDiscountFromInput(
    basePrice: number,
    discountType: 'amount' | 'percent',
    discountValue: number
  ): number {
    if (discountType === 'percent') {
      const pct = Math.min(100, Math.max(0, discountValue));
      return Math.round((basePrice * pct) / 100);
    }
    return Math.min(basePrice, Math.max(0, discountValue));
  }

  /**
   * Calculate total order subtotal before order-level discounts
   */
  public static calculateSubtotal(cartItems: CartItem[]): number {
    return cartItems.reduce((sum, item) => {
      if (item.isGift || item.isOutOfStock) return sum;
      const lineTotal = this.calculateLineTotal(item.product.basePrice, item.quantity, item.discount, item.isGift);
      return sum + lineTotal;
    }, 0);
  }

  /**
   * Calculate order grand total
   */
  public static calculateGrandTotal(subtotal: number, orderDiscount = 0): number {
    return Math.max(0, subtotal - (orderDiscount || 0));
  }
}
