import { z } from "zod";
import { AgentTool, ToolContext, ToolResult } from "./types.js";
import { ProductService } from "../services/product.service.js";
import { InventoryChangeType } from "@prisma/client";

// 1. list_products
const listProductsSchema = z.object({
  search: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const listProductsTool: AgentTool = {
  definition: {
    name: "list_products",
    description: "List active products in the store's inventory, optionally filtered by keyword.",
    parameters: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Optional search query to filter by name, SKU, or description.",
        },
        limit: {
          type: "number",
          description: "Maximum number of products to return (default 20).",
        },
      },
    },
  },
  async execute(rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = listProductsSchema.safeParse(rawInput || {});
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => i.message).join("; "),
          details: parsed.error.issues,
        },
      };
    }

    try {
      const products = await ProductService.listProducts(context.businessId, {
        search: parsed.data.search,
        activeOnly: true,
      });

      const items = products.slice(0, parsed.data.limit).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        currency: p.currency,
        stockQuantity: p.stockQuantity,
        unit: p.unit,
        sku: p.sku,
      }));

      return {
        success: true,
        data: {
          total: items.length,
          products: items,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "PRODUCT_LIST_FAILED",
          message: err instanceof Error ? err.message : "Failed to list products",
        },
      };
    }
  },
};

// 2. get_product
const getProductSchema = z.object({
  query: z.string().min(1, "query (name, SKU, or UUID) is required"),
});

export const getProductTool: AgentTool = {
  definition: {
    name: "get_product",
    description: "Retrieve details and current stock of a specific product by name or SKU.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Product name (e.g. 'Sugar', 'Potatoes') or SKU.",
        },
      },
      required: ["query"],
    },
  },
  async execute(rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = getProductSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => i.message).join("; "),
          details: parsed.error.issues,
        },
      };
    }

    try {
      const product = await ProductService.findProductByNameOrQuery(
        context.businessId,
        parsed.data.query,
      );

      return {
        success: true,
        data: {
          id: product.id,
          name: product.name,
          description: product.description,
          price: Number(product.price),
          currency: product.currency,
          stockQuantity: product.stockQuantity,
          unit: product.unit,
          sku: product.sku,
          active: product.active,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: err instanceof Error ? err.message : "Product not found",
        },
      };
    }
  },
};

// 3. create_product (requires seller authorization)
const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  price: z.number().nonnegative("Price must be a positive number"),
  currency: z.string().default("INR"),
  initialStock: z.number().int().nonnegative().default(0),
  unit: z.string().default("pcs"),
  sku: z.string().optional(),
  description: z.string().optional(),
});

export const createProductTool: AgentTool = {
  definition: {
    name: "create_product",
    description: "Add a new product to the store inventory. (Authorized Sellers Only)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the item (e.g. 'Organic Tomatoes').",
        },
        price: {
          type: "number",
          description: "Price per unit in currency.",
        },
        currency: {
          type: "string",
          description: "Currency code (default 'INR').",
        },
        initialStock: {
          type: "number",
          description: "Initial stock quantity (default 0).",
        },
        unit: {
          type: "string",
          description: "Unit of measurement (e.g. 'kg', 'pcs', 'litre', 'bag').",
        },
        sku: {
          type: "string",
          description: "Optional SKU barcode/code.",
        },
        description: {
          type: "string",
          description: "Optional product description.",
        },
      },
      required: ["name", "price"],
    },
  },
  async execute(rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    if (!context.isSellerAuthorized) {
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Unauthorized: Only registered store owners/members can create products.",
        },
      };
    }

    const parsed = createProductSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => i.message).join("; "),
          details: parsed.error.issues,
        },
      };
    }

    try {
      const product = await ProductService.createProduct({
        businessId: context.businessId,
        name: parsed.data.name,
        price: parsed.data.price,
        currency: parsed.data.currency,
        initialStock: parsed.data.initialStock,
        unit: parsed.data.unit,
        sku: parsed.data.sku,
        description: parsed.data.description,
        performedBy: context.customerPhone || "whatsapp-seller",
        changeType: InventoryChangeType.MANUAL_TEXT,
      });

      return {
        success: true,
        data: {
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          stockQuantity: product.stockQuantity,
          unit: product.unit,
          message: `Product '${product.name}' created successfully with price ₹${product.price} and initial stock ${product.stockQuantity} ${product.unit}.`,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_PRODUCT_FAILED",
          message: err instanceof Error ? err.message : "Failed to create product",
        },
      };
    }
  },
};

// 4. update_product_price (requires seller authorization)
const updatePriceSchema = z.object({
  query: z.string().min(1, "Product name or SKU is required"),
  newPrice: z.number().nonnegative("newPrice must be positive"),
  reason: z.string().optional(),
});

export const updateProductPriceTool: AgentTool = {
  definition: {
    name: "update_product_price",
    description: "Update the selling price of an existing product. (Authorized Sellers Only)",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name or SKU of the product to update.",
        },
        newPrice: {
          type: "number",
          description: "The new selling price.",
        },
        reason: {
          type: "string",
          description: "Optional reason for the price update.",
        },
      },
      required: ["query", "newPrice"],
    },
  },
  async execute(rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    if (!context.isSellerAuthorized) {
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Unauthorized: Only registered store owners/members can update prices.",
        },
      };
    }

    const parsed = updatePriceSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => i.message).join("; "),
          details: parsed.error.issues,
        },
      };
    }

    try {
      const product = await ProductService.findProductByNameOrQuery(
        context.businessId,
        parsed.data.query,
      );

      const result = await ProductService.updatePrice({
        businessId: context.businessId,
        productId: product.id,
        newPrice: parsed.data.newPrice,
        performedBy: context.customerPhone || "whatsapp-seller",
        changeType: InventoryChangeType.MANUAL_TEXT,
        reason: parsed.data.reason || "WhatsApp price update",
      });

      return {
        success: true,
        data: {
          productId: result.product.id,
          name: result.product.name,
          previousPrice: Number(result.audit.previousPrice),
          newPrice: Number(result.product.price),
          message: `Price for '${result.product.name}' updated from ₹${result.audit.previousPrice} to ₹${result.product.price}.`,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_PRICE_FAILED",
          message: err instanceof Error ? err.message : "Failed to update price",
        },
      };
    }
  },
};

// 5. adjust_inventory (requires seller authorization)
const adjustInventorySchema = z.object({
  query: z.string().min(1, "Product name or SKU is required"),
  quantityDelta: z.number().int().refine((val) => val !== 0, "quantityDelta cannot be 0"),
  reason: z.string().optional(),
});

export const adjustInventoryTool: AgentTool = {
  definition: {
    name: "adjust_inventory",
    description:
      "Adjust the stock count of a product by adding (+delta for restock) or removing (-delta for sale/spoilage). (Authorized Sellers Only)",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name or SKU of the product to adjust.",
        },
        quantityDelta: {
          type: "number",
          description: "Positive number to add stock, or negative number to reduce stock.",
        },
        reason: {
          type: "string",
          description: "Optional reason for the adjustment (e.g. 'Wholesale restock', 'Physical sale').",
        },
      },
      required: ["query", "quantityDelta"],
    },
  },
  async execute(rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    if (!context.isSellerAuthorized) {
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Unauthorized: Only registered store owners/members can adjust inventory.",
        },
      };
    }

    const parsed = adjustInventorySchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => i.message).join("; "),
          details: parsed.error.issues,
        },
      };
    }

    try {
      const product = await ProductService.findProductByNameOrQuery(
        context.businessId,
        parsed.data.query,
      );

      const changeType = parsed.data.quantityDelta > 0
        ? InventoryChangeType.RESTOCK
        : InventoryChangeType.ADJUSTMENT;

      const result = await ProductService.adjustStock({
        businessId: context.businessId,
        productId: product.id,
        quantityDelta: parsed.data.quantityDelta,
        performedBy: context.customerPhone || "whatsapp-seller",
        changeType,
        reason: parsed.data.reason || "WhatsApp inventory update",
      });

      return {
        success: true,
        data: {
          productId: result.product.id,
          name: result.product.name,
          quantityDelta: result.audit.quantityDelta,
          previousStock: result.audit.previousQuantity,
          newStock: result.product.stockQuantity,
          unit: result.product.unit,
          message: `Stock for '${result.product.name}' adjusted by ${result.audit.quantityDelta > 0 ? "+" : ""}${result.audit.quantityDelta}. New stock: ${result.product.stockQuantity} ${result.product.unit}.`,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "ADJUST_STOCK_FAILED",
          message: err instanceof Error ? err.message : "Failed to adjust stock",
        },
      };
    }
  },
};

// 6. get_inventory_summary (requires seller authorization)
export const getInventorySummaryTool: AgentTool = {
  definition: {
    name: "get_inventory_summary",
    description: "Get an overview summary of total products, low-stock alerts, and total inventory value. (Authorized Sellers Only)",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  async execute(_rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    if (!context.isSellerAuthorized) {
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Unauthorized: Only registered store owners/members can view inventory summaries.",
        },
      };
    }

    try {
      const summary = await ProductService.getInventorySummary(context.businessId);

      return {
        success: true,
        data: summary,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "SUMMARY_FAILED",
          message: err instanceof Error ? err.message : "Failed to get inventory summary",
        },
      };
    }
  },
};
