export interface StockCheckResult {
  isValid: boolean;
  availableStock: number;
  status: 'InStock' | 'LowStock' | 'OutOfStock';
  message: string;
}

/**
 * OOP Utility class encapsulating business rules for product warehouse stock validation.
 */
export class ProductStockValidator {
  /**
   * Evaluates if a product has available stock at the specified branch/warehouse.
   */
  public static validateStock(
    productAvailableStock: number | null | undefined,
    requestedQty: number = 1
  ): StockCheckResult {
    const stock = productAvailableStock ?? 0;

    if (stock <= 0) {
      return {
        isValid: false,
        availableStock: stock,
        status: 'OutOfStock',
        message: 'Hết',
      };
    }

    if (stock < requestedQty) {
      return {
        isValid: false,
        availableStock: stock,
        status: 'LowStock',
        message: `Còn ${stock}`,
      };
    }

    if (stock <= 5) {
      return {
        isValid: true,
        availableStock: stock,
        status: 'LowStock',
        message: `Còn ${stock}`,
      };
    }

    return {
      isValid: true,
      availableStock: stock,
      status: 'InStock',
      message: `Còn ${stock}`,
    };
  }

  /**
   * Filters cart items to return only items valid for inclusion in Invoice & Order calculations.
   */
  public static filterValidItemsForInvoice<T extends { isOutOfStock?: boolean }>(items: T[]): T[] {
    return items.filter(item => !item.isOutOfStock);
  }
}
