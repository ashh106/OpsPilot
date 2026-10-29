import { InventoryChangeType, Prisma, Product } from "@prisma/client";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/errors.js";

export interface CreateProductInput {
  businessId: string;
  name: string;
  description?: string;
  sku?: string | null;
  price: number | string | Prisma.Decimal;
  currency?: string;
  initialStock?: number;
  unit?: string;
  performedBy: string;
  changeType?: InventoryChangeType;
  reason?: string;
}

export interface AdjustStockInput {
  businessId: string;
  productId: string;
  quantityDelta: number;
  performedBy: string;
  changeType?: InventoryChangeType;
  reason?: string;
  allowNegative?: boolean;
  idempotencyKey?: string;
}

export interface UpdatePriceInput {
  businessId: string;
  productId: string;
  newPrice: number | string | Prisma.Decimal;
  performedBy: string;
  changeType?: InventoryChangeType;
  reason?: string;
  idempotencyKey?: string;
}

export interface InventorySummary {
  businessId: string;
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number; // Stock < 5
  outOfStockProducts: number; // Stock == 0
  totalStockCount: number;
  totalInventoryValue: number;
}

export class ProductService {
  /**
   * Lists products for a business with optional filtering and search.
   */
  static async listProducts(
    businessId: string,
    options: { activeOnly?: boolean; search?: string } = {},
  ): Promise<Product[]> {
    const where: Prisma.ProductWhereInput = { businessId };

    if (options.activeOnly !== false) {
      where.active = true;
    }

    if (options.search?.trim()) {
      where.OR = [
        { name: { contains: options.search.trim(), mode: "insensitive" } },
        { sku: { contains: options.search.trim(), mode: "insensitive" } },
        { description: { contains: options.search.trim(), mode: "insensitive" } },
      ];
    }

    return prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  /**
   * Retrieves a single product by ID, enforcing tenant isolation.
   */
  static async getProduct(businessId: string, productId: string): Promise<Product> {
    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
    });

    if (!product) {
      throw AppError.notFound(`Product with ID '${productId}' not found for this business.`);
    }

    return product;
  }

  /**
   * Finds a product by exact UUID or case-insensitive name/SKU within the business tenant.
   */
  static async findProductByNameOrQuery(businessId: string, query: string): Promise<Product> {
    const trimmed = query.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

    if (isUuid) {
      const byId = await prisma.product.findFirst({
        where: { id: trimmed, businessId },
      });
      if (byId) return byId;
    }

    // Try exact SKU match first
    const bySku = await prisma.product.findFirst({
      where: { businessId, sku: { equals: trimmed, mode: "insensitive" } },
    });
    if (bySku) return bySku;

    // Try name match (exact or substring)
    const byName = await prisma.product.findFirst({
      where: { businessId, name: { contains: trimmed, mode: "insensitive" } },
      orderBy: { active: "desc" },
    });

    if (!byName) {
      throw AppError.notFound(`Product matching '${query}' not found for this business.`);
    }

    return byName;
  }

  /**
   * Creates a product transactionally, generating initial stock and audit history if initialStock > 0.
   */
  static async createProduct(input: CreateProductInput): Promise<Product> {
    const {
      businessId,
      name,
      description = "",
      sku = null,
      price,
      currency = "INR",
      initialStock = 0,
      unit = "pcs",
      performedBy,
      changeType = InventoryChangeType.MANUAL_TEXT,
      reason,
    } = input;

    if (!name?.trim()) {
      throw AppError.validation("Product name is required.");
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      throw AppError.validation("Price must be a non-negative number.");
    }

    if (initialStock < 0) {
      throw AppError.validation("Initial stock cannot be negative.");
    }

    const decimalPrice = new Prisma.Decimal(numPrice.toFixed(2));

    return prisma.$transaction(async (tx) => {
      // Validate business exists
      const business = await tx.business.findUnique({
        where: { id: businessId },
        select: { id: true },
      });
      if (!business) {
        throw AppError.notFound(`Business '${businessId}' not found.`);
      }

      // Check SKU uniqueness per business
      if (sku?.trim()) {
        const existing = await tx.product.findUnique({
          where: { businessId_sku: { businessId, sku: sku.trim() } },
        });
        if (existing) {
          throw AppError.conflict("CONFLICT", `Product with SKU '${sku.trim()}' already exists.`);
        }
      }

      const product = await tx.product.create({
        data: {
          businessId,
          name: name.trim(),
          description: description.trim(),
          sku: sku?.trim() || null,
          price: decimalPrice,
          currency: currency.toUpperCase(),
          stockQuantity: initialStock,
          unit: unit.trim().toLowerCase(),
          active: true,
        },
      });

      // If initial stock was provided, record initial audit log
      if (initialStock > 0) {
        await tx.inventoryAudit.create({
          data: {
            businessId,
            productId: product.id,
            changeType,
            quantityDelta: initialStock,
            previousQuantity: 0,
            newQuantity: initialStock,
            previousPrice: null,
            newPrice: decimalPrice,
            performedBy,
            reason: reason || "Initial stock entry",
          },
        });
      }

      return product;
    });
  }

  /**
   * Validates that an existing audit record with the same idempotency key matches the current request parameters.
   */
  private static validateAuditPayloadMatch(
    existingAudit: Prisma.InventoryAuditGetPayload<object>,
    expected: {
      businessId: string;
      productId: string;
      operation: "STOCK" | "PRICE";
      quantityDelta?: number;
      newPrice?: Prisma.Decimal;
    },
  ) {
    if (existingAudit.businessId !== expected.businessId) {
      throw AppError.conflict(
        "IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH",
        "Idempotency key has already been used for a different business.",
      );
    }
    if (existingAudit.productId !== expected.productId) {
      throw AppError.conflict(
        "IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH",
        "Idempotency key has already been used for a different product.",
      );
    }
    if (expected.operation === "STOCK") {
      // Must not be a price update audit (price updates record quantityDelta === 0)
      if (existingAudit.quantityDelta === 0) {
        throw AppError.conflict(
          "IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH",
          "Idempotency key has already been used for a price update, cannot reuse for a stock adjustment.",
        );
      }
      if (existingAudit.quantityDelta !== expected.quantityDelta) {
        throw AppError.conflict(
          "IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH",
          `Idempotency key has already been used with quantityDelta ${existingAudit.quantityDelta}, cannot reuse with ${expected.quantityDelta}.`,
        );
      }
    }
    if (expected.operation === "PRICE") {
      // Must not be a stock adjustment audit (stock adjustments record quantityDelta !== 0)
      if (existingAudit.quantityDelta !== 0) {
        throw AppError.conflict(
          "IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH",
          "Idempotency key has already been used for a stock adjustment, cannot reuse for a price update.",
        );
      }
      if (
        !existingAudit.newPrice ||
        Number(existingAudit.newPrice) !== Number(expected.newPrice)
      ) {
        throw AppError.conflict(
          "IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH",
          `Idempotency key has already been used with price ${existingAudit.newPrice}, cannot reuse with ${expected.newPrice}.`,
        );
      }
    }
  }

  /**
   * Adjusts stock quantity transactionally with concurrency safety and audit trail.
   */
  static async adjustStock(input: AdjustStockInput): Promise<{
    product: Product;
    audit: Prisma.InventoryAuditGetPayload<object>;
  }> {
    const {
      businessId,
      productId,
      quantityDelta,
      performedBy,
      changeType,
      reason,
      allowNegative = false,
      idempotencyKey,
    } = input;

    if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
      throw AppError.validation("quantityDelta must be a non-zero integer.");
    }

    // 1. Pre-flight check outside transaction
    if (idempotencyKey) {
      const existingAudit = await prisma.inventoryAudit.findUnique({
        where: { idempotencyKey },
      });
      if (existingAudit) {
        this.validateAuditPayloadMatch(existingAudit, {
          businessId,
          productId,
          operation: "STOCK",
          quantityDelta,
        });
        const product = await prisma.product.findUnique({
          where: { id: productId },
        });
        if (product) {
          return { product, audit: existingAudit };
        }
      }
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Read current state with row-level lock (FOR UPDATE) to prevent lost updates under concurrency
        const rows = await tx.$queryRaw<Product[]>`
          SELECT * FROM "Product"
          WHERE "id" = ${productId}::uuid AND "businessId" = ${businessId}::uuid
          FOR UPDATE
        `;

        const product = rows[0];
        if (!product) {
          throw AppError.notFound(`Product with ID '${productId}' not found for this business.`);
        }

        // Re-check idempotency key after acquiring row lock in case a concurrent request with the same key committed
        if (idempotencyKey) {
          const lockedExistingAudit = await tx.inventoryAudit.findUnique({
            where: { idempotencyKey },
          });
          if (lockedExistingAudit) {
            this.validateAuditPayloadMatch(lockedExistingAudit, {
              businessId,
              productId,
              operation: "STOCK",
              quantityDelta,
            });
            return { product, audit: lockedExistingAudit };
          }
        }

        const previousQuantity = product.stockQuantity;
        const newQuantity = previousQuantity + quantityDelta;

        if (newQuantity < 0 && !allowNegative) {
          throw AppError.validation(
            `Insufficient stock for '${product.name}'. Current stock is ${previousQuantity} ${product.unit}, cannot reduce by ${Math.abs(quantityDelta)}.`,
          );
        }

        // Update product stock
        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: { stockQuantity: newQuantity },
        });

        // Record audit record
        const audit = await tx.inventoryAudit.create({
          data: {
            businessId,
            productId: product.id,
            changeType: changeType || InventoryChangeType.MANUAL_TEXT,
            quantityDelta,
            previousQuantity,
            newQuantity,
            previousPrice: product.price,
            newPrice: product.price,
            performedBy,
            reason: reason || null,
            idempotencyKey: idempotencyKey || null,
          },
        });

        return { product: updatedProduct, audit };
      });
    } catch (err: unknown) {
      if (
        idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === "P2002" || err.code === "P2034")
      ) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const committedAudit = await prisma.inventoryAudit.findUnique({
            where: { idempotencyKey },
          });
          if (committedAudit) {
            this.validateAuditPayloadMatch(committedAudit, {
              businessId,
              productId,
              operation: "STOCK",
              quantityDelta,
            });
            const product = await prisma.product.findUnique({
              where: { id: committedAudit.productId },
            });
            if (product) {
              return { product, audit: committedAudit };
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        }
      }
      throw err;
    }
  }

  /**
   * Updates product price transactionally with audit history.
   */
  static async updatePrice(input: UpdatePriceInput): Promise<{
    product: Product;
    audit: Prisma.InventoryAuditGetPayload<object>;
  }> {
    const {
      businessId,
      productId,
      newPrice,
      performedBy,
      changeType = InventoryChangeType.MANUAL_TEXT,
      reason,
      idempotencyKey,
    } = input;

    const numPrice = Number(newPrice);
    if (isNaN(numPrice) || numPrice < 0) {
      throw AppError.validation("newPrice must be a non-negative number.");
    }

    const decimalPrice = new Prisma.Decimal(numPrice.toFixed(2));

    // 1. Pre-flight check outside transaction
    if (idempotencyKey) {
      const existingAudit = await prisma.inventoryAudit.findUnique({
        where: { idempotencyKey },
      });
      if (existingAudit) {
        this.validateAuditPayloadMatch(existingAudit, {
          businessId,
          productId,
          operation: "PRICE",
          newPrice: decimalPrice,
        });
        const product = await prisma.product.findUnique({
          where: { id: productId },
        });
        if (product) {
          return { product, audit: existingAudit };
        }
      }
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Product[]>`
          SELECT * FROM "Product"
          WHERE "id" = ${productId}::uuid AND "businessId" = ${businessId}::uuid
          FOR UPDATE
        `;

        const product = rows[0];
        if (!product) {
          throw AppError.notFound(`Product with ID '${productId}' not found for this business.`);
        }

        // Re-check idempotency key after acquiring row lock
        if (idempotencyKey) {
          const lockedExistingAudit = await tx.inventoryAudit.findUnique({
            where: { idempotencyKey },
          });
          if (lockedExistingAudit) {
            this.validateAuditPayloadMatch(lockedExistingAudit, {
              businessId,
              productId,
              operation: "PRICE",
              newPrice: decimalPrice,
            });
            return { product, audit: lockedExistingAudit };
          }
        }

        const previousPrice = product.price;

        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: { price: decimalPrice },
        });

        const audit = await tx.inventoryAudit.create({
          data: {
            businessId,
            productId: product.id,
            changeType,
            quantityDelta: 0,
            previousQuantity: product.stockQuantity,
            newQuantity: product.stockQuantity,
            previousPrice,
            newPrice: decimalPrice,
            performedBy,
            reason: reason || `Price updated from ${previousPrice} to ${decimalPrice}`,
            idempotencyKey: idempotencyKey || null,
          },
        });

        return { product: updatedProduct, audit };
      });
    } catch (err: unknown) {
      if (
        idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === "P2002" || err.code === "P2034")
      ) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const committedAudit = await prisma.inventoryAudit.findUnique({
            where: { idempotencyKey },
          });
          if (committedAudit) {
            this.validateAuditPayloadMatch(committedAudit, {
              businessId,
              productId,
              operation: "PRICE",
              newPrice: decimalPrice,
            });
            const product = await prisma.product.findUnique({
              where: { id: committedAudit.productId },
            });
            if (product) {
              return { product, audit: committedAudit };
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        }
      }
      throw err;
    }
  }

  /**
   * Computes inventory summary statistics for the dashboard or WhatsApp assistant.
   */
  static async getInventorySummary(businessId: string): Promise<InventorySummary> {
    const products = await prisma.product.findMany({
      where: { businessId },
    });

    let activeProducts = 0;
    let lowStockProducts = 0;
    let outOfStockProducts = 0;
    let totalStockCount = 0;
    let totalInventoryValue = 0;

    for (const p of products) {
      if (p.active) {
        activeProducts++;
        const stock = p.stockQuantity;
        totalStockCount += stock;
        totalInventoryValue += stock * Number(p.price);

        if (stock === 0) {
          outOfStockProducts++;
        } else if (stock < 5) {
          lowStockProducts++;
        }
      }
    }

    return {
      businessId,
      totalProducts: products.length,
      activeProducts,
      lowStockProducts,
      outOfStockProducts,
      totalStockCount,
      totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
    };
  }

  /**
   * Retrieves audit logs for a business or specific product.
   */
  static async getInventoryAudits(
    businessId: string,
    productId?: string,
    limit: number = 50,
  ) {
    const where: Prisma.InventoryAuditWhereInput = { businessId };
    if (productId) {
      where.productId = productId;
    }

    return prisma.inventoryAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      include: {
        product: { select: { name: true, unit: true, sku: true } },
      },
    });
  }
}
