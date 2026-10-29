import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ProductService } from "../services/product.service.js";
import { InventoryChangeType } from "@prisma/client";
import { AppError } from "../utils/errors.js";
import { assertBusinessMembership } from "../middleware/auth.js";

const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  sku: z.string().optional().nullable(),
  price: z.number().nonnegative("Price must be non-negative"),
  currency: z.string().default("INR"),
  initialStock: z.number().int().nonnegative().default(0),
  unit: z.string().default("pcs"),
  reason: z.string().optional(),
});

const adjustStockSchema = z.object({
  quantityDelta: z.number().int().refine((val) => val !== 0, "quantityDelta cannot be 0"),
  reason: z.string().optional(),
  changeType: z.nativeEnum(InventoryChangeType).default(InventoryChangeType.WEB_DASHBOARD),
});

const updatePriceSchema = z.object({
  newPrice: z.number().nonnegative("Price must be non-negative"),
  reason: z.string().optional(),
  changeType: z.nativeEnum(InventoryChangeType).default(InventoryChangeType.WEB_DASHBOARD),
});

export class ProductController {
  private static async getBizIdAndAuthorize(req: Request): Promise<string> {
    if (!req.user) {
      throw AppError.unauthorized();
    }
    const rawId = req.params.businessId || req.params.id;
    const businessId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!businessId) {
      throw AppError.validation("Business ID is required in URL parameters.");
    }

    // Verify authenticated user is a business member
    await assertBusinessMembership(req.user.userId, businessId);

    return businessId;
  }

  static async listProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = await ProductController.getBizIdAndAuthorize(req);
      const { search, activeOnly } = req.query;

      const products = await ProductService.listProducts(businessId, {
        search: typeof search === "string" ? search : undefined,
        activeOnly: activeOnly === "false" ? false : true,
      });

      res.json({ data: products });
    } catch (err) {
      next(err);
    }
  }

  static async getProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = await ProductController.getBizIdAndAuthorize(req);
      const rawProdId = req.params.productId;
      const productId = Array.isArray(rawProdId) ? rawProdId[0] : rawProdId;
      if (!productId) {
        throw AppError.validation("Product ID is required.");
      }

      const product = await ProductService.getProduct(businessId, productId);
      res.json({ data: product });
    } catch (err) {
      next(err);
    }
  }

  static async createProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = await ProductController.getBizIdAndAuthorize(req);
      const parsed = createProductSchema.parse(req.body);
      const userId = req.user?.userId || "dashboard-user";

      const product = await ProductService.createProduct({
        businessId,
        ...parsed,
        performedBy: userId,
        changeType: InventoryChangeType.WEB_DASHBOARD,
      });

      res.status(201).json({ data: product });
    } catch (err) {
      next(err);
    }
  }

  static async adjustStock(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = await ProductController.getBizIdAndAuthorize(req);
      const rawProdId = req.params.productId;
      const productId = Array.isArray(rawProdId) ? rawProdId[0] : rawProdId;
      if (!productId) {
        throw AppError.validation("Product ID is required.");
      }

      const parsed = adjustStockSchema.parse(req.body);
      const userId = req.user?.userId || "dashboard-user";

      const result = await ProductService.adjustStock({
        businessId,
        productId,
        quantityDelta: parsed.quantityDelta,
        performedBy: userId,
        changeType: parsed.changeType,
        reason: parsed.reason,
      });

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  static async updatePrice(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = await ProductController.getBizIdAndAuthorize(req);
      const rawProdId = req.params.productId;
      const productId = Array.isArray(rawProdId) ? rawProdId[0] : rawProdId;
      if (!productId) {
        throw AppError.validation("Product ID is required.");
      }

      const parsed = updatePriceSchema.parse(req.body);
      const userId = req.user?.userId || "dashboard-user";

      const result = await ProductService.updatePrice({
        businessId,
        productId,
        newPrice: parsed.newPrice,
        performedBy: userId,
        changeType: parsed.changeType,
        reason: parsed.reason,
      });

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = await ProductController.getBizIdAndAuthorize(req);
      const summary = await ProductService.getInventorySummary(businessId);
      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  }

  static async getAudits(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = await ProductController.getBizIdAndAuthorize(req);
      const rawProdId = req.params.productId;
      const productId = Array.isArray(rawProdId) ? rawProdId[0] : rawProdId;

      if (productId) {
        // Enforce tenant boundary: verify product exists within authorized business
        await ProductService.getProduct(businessId, productId);
      }

      const audits = await ProductService.getInventoryAudits(businessId, productId);
      res.json({ data: audits });
    } catch (err) {
      next(err);
    }
  }
}
