import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { ProductService } from "../src/services/product.service.js";
import { SellerAuthService } from "../src/services/seller-auth.service.js";
import { InventoryChangeType } from "@prisma/client";
import { AppError } from "../src/utils/errors.js";

describe("Inventory Domain & Seller Authorization", () => {
  let businessAId: string;
  let businessBId: string;
  let ownerUserId: string;
  const ownerPhone = "919876543210";

  beforeEach(async () => {
    // Clean up test data
    await prisma.inventoryAudit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.businessMember.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();

    // Create owner user with verified phone
    const user = await prisma.user.create({
      data: {
        email: "seller@kirana.test",
        passwordHash: "hashed_pw",
        name: "Ramesh Sharma",
        phone: ownerPhone,
        phoneVerified: true,
      },
    });
    ownerUserId = user.id;

    // Create primary grocery business
    const bizA = await prisma.business.create({
      data: {
        name: "Sharma Kirana Store",
        slug: "sharma-kirana",
        category: "GROCERY",
        defaultLanguage: "hi",
        supportedLanguages: ["hi", "en", "mr"],
      },
    });
    businessAId = bizA.id;

    // Link user as OWNER of business A
    await prisma.businessMember.create({
      data: {
        userId: ownerUserId,
        businessId: businessAId,
        role: "OWNER",
      },
    });

    // Create a second business for tenant isolation tests
    const bizB = await prisma.business.create({
      data: {
        name: "Patil General Store",
        slug: "patil-general",
        category: "RETAIL",
        defaultLanguage: "mr",
      },
    });
    businessBId = bizB.id;
  });

  afterAll(async () => {
    await prisma.inventoryAudit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.businessMember.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();
  });

  it("creates products with initial stock and initial audit entry", async () => {
    const product = await ProductService.createProduct({
      businessId: businessAId,
      name: "Basmati Rice 5kg",
      sku: "RICE-BAS-5KG",
      price: 450,
      currency: "INR",
      initialStock: 20,
      unit: "bag",
      performedBy: ownerUserId,
      changeType: InventoryChangeType.RESTOCK,
      reason: "Initial stock intake",
    });

    expect(product.id).toBeDefined();
    expect(product.name).toBe("Basmati Rice 5kg");
    expect(product.sku).toBe("RICE-BAS-5KG");
    expect(Number(product.price)).toBe(450);
    expect(product.stockQuantity).toBe(20);
    expect(product.unit).toBe("bag");

    // Check audit log creation
    const audits = await prisma.inventoryAudit.findMany({
      where: { productId: product.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.quantityDelta).toBe(20);
    expect(audits[0]?.previousQuantity).toBe(0);
    expect(audits[0]?.newQuantity).toBe(20);
    expect(audits[0]?.performedBy).toBe(ownerUserId);
  });

  it("enforces tenant-scoped SKU uniqueness", async () => {
    await ProductService.createProduct({
      businessId: businessAId,
      name: "Aashirvaad Atta 10kg",
      sku: "ATTA-10KG",
      price: 420,
      performedBy: ownerUserId,
    });

    // Same SKU in same business should fail
    await expect(
      ProductService.createProduct({
        businessId: businessAId,
        name: "Duplicate Atta",
        sku: "ATTA-10KG",
        price: 400,
        performedBy: ownerUserId,
      }),
    ).rejects.toThrow(AppError);

    // Same SKU in DIFFERENT business should succeed
    const prodB = await ProductService.createProduct({
      businessId: businessBId,
      name: "Atta in Shop B",
      sku: "ATTA-10KG",
      price: 430,
      performedBy: "another-owner",
    });
    expect(prodB.id).toBeDefined();
  });

  it("enforces tenant isolation across businesses", async () => {
    const productA = await ProductService.createProduct({
      businessId: businessAId,
      name: "Amul Butter 500g",
      price: 275,
      initialStock: 15,
      performedBy: ownerUserId,
    });

    // Business B cannot query product of Business A
    await expect(ProductService.getProduct(businessBId, productA.id)).rejects.toThrow(AppError);

    // Business B cannot adjust stock of Business A
    await expect(
      ProductService.adjustStock({
        businessId: businessBId,
        productId: productA.id,
        quantityDelta: 5,
        performedBy: "intruder",
        changeType: InventoryChangeType.MANUAL_TEXT,
      }),
    ).rejects.toThrow(AppError);
  });

  it("adjusts stock with atomic updates and complete audit history", async () => {
    const product = await ProductService.createProduct({
      businessId: businessAId,
      name: "Tata Salt 1kg",
      price: 28,
      initialStock: 50,
      performedBy: ownerUserId,
    });

    // 1. Stock reduction (e.g. sale of 10 packets)
    const reduction = await ProductService.adjustStock({
      businessId: businessAId,
      productId: product.id,
      quantityDelta: -10,
      performedBy: ownerUserId,
      changeType: InventoryChangeType.SALE,
      reason: "WhatsApp customer order",
    });

    expect(reduction.product.stockQuantity).toBe(40);
    expect(reduction.audit.previousQuantity).toBe(50);
    expect(reduction.audit.newQuantity).toBe(40);
    expect(reduction.audit.quantityDelta).toBe(-10);

    // 2. Stock addition (e.g. restock 30 packets)
    const addition = await ProductService.adjustStock({
      businessId: businessAId,
      productId: product.id,
      quantityDelta: 30,
      performedBy: ownerUserId,
      changeType: InventoryChangeType.RESTOCK,
      reason: "Wholesale delivery",
    });

    expect(addition.product.stockQuantity).toBe(70);
    expect(addition.audit.previousQuantity).toBe(40);
    expect(addition.audit.newQuantity).toBe(70);
    expect(addition.audit.quantityDelta).toBe(30);

    // Verify audit logs total count
    const audits = await ProductService.getInventoryAudits(businessAId, product.id);
    expect(audits).toHaveLength(3); // Initial (50) + Reduction (-10) + Addition (+30)
  });

  it("prevents reducing stock below zero", async () => {
    const product = await ProductService.createProduct({
      businessId: businessAId,
      name: "Fortune Mustard Oil 1L",
      price: 160,
      initialStock: 5,
      performedBy: ownerUserId,
    });

    await expect(
      ProductService.adjustStock({
        businessId: businessAId,
        productId: product.id,
        quantityDelta: -10, // Exceeds current stock 5
        performedBy: ownerUserId,
        changeType: InventoryChangeType.MANUAL_TEXT,
      }),
    ).rejects.toThrow(/Insufficient stock/);

    // Verify stock remains untouched at 5
    const current = await ProductService.getProduct(businessAId, product.id);
    expect(current.stockQuantity).toBe(5);
  });

  it("updates price transactionally with decimal precision and audit log", async () => {
    const product = await ProductService.createProduct({
      businessId: businessAId,
      name: "Sugar 1kg",
      price: 42.5,
      initialStock: 100,
      performedBy: ownerUserId,
    });

    const update = await ProductService.updatePrice({
      businessId: businessAId,
      productId: product.id,
      newPrice: 45.0,
      performedBy: ownerUserId,
      changeType: InventoryChangeType.VOICE_NOTE,
      reason: "Voice note price revision",
    });

    expect(Number(update.product.price)).toBe(45);
    expect(Number(update.audit.previousPrice)).toBe(42.5);
    expect(Number(update.audit.newPrice)).toBe(45);
    expect(update.audit.changeType).toBe(InventoryChangeType.VOICE_NOTE);
  });

  it("handles concurrent stock adjustments accurately without lost updates", async () => {
    const product = await ProductService.createProduct({
      businessId: businessAId,
      name: "Maggi 4-Pack",
      price: 56,
      initialStock: 100,
      performedBy: ownerUserId,
    });

    // Dispatch 5 concurrent increments of +10 and 5 concurrent decrements of -5
    const operations = [
      ...Array(5).fill(10).map((delta) =>
        ProductService.adjustStock({
          businessId: businessAId,
          productId: product.id,
          quantityDelta: delta,
          performedBy: ownerUserId,
          changeType: InventoryChangeType.ADJUSTMENT,
        })
      ),
      ...Array(5).fill(-5).map((delta) =>
        ProductService.adjustStock({
          businessId: businessAId,
          productId: product.id,
          quantityDelta: delta,
          performedBy: ownerUserId,
          changeType: InventoryChangeType.SALE,
        })
      ),
    ];

    await Promise.all(operations);

    // Expected final: 100 + (5 * 10) - (5 * 5) = 100 + 50 - 25 = 125
    const finalProduct = await ProductService.getProduct(businessAId, product.id);
    expect(finalProduct.stockQuantity).toBe(125);
  });

  it("calculates inventory summary accurately", async () => {
    await ProductService.createProduct({
      businessId: businessAId,
      name: "Item High Stock",
      price: 100,
      initialStock: 20,
      performedBy: ownerUserId,
    });

    await ProductService.createProduct({
      businessId: businessAId,
      name: "Item Low Stock",
      price: 50,
      initialStock: 3, // Low stock (< 5)
      performedBy: ownerUserId,
    });

    await ProductService.createProduct({
      businessId: businessAId,
      name: "Item Out Of Stock",
      price: 200,
      initialStock: 0, // Out of stock
      performedBy: ownerUserId,
    });

    const summary = await ProductService.getInventorySummary(businessAId);
    expect(summary.totalProducts).toBe(3);
    expect(summary.activeProducts).toBe(3);
    expect(summary.lowStockProducts).toBe(1);
    expect(summary.outOfStockProducts).toBe(1);
    expect(summary.totalStockCount).toBe(23);
    // Value: (20 * 100) + (3 * 50) + (0 * 200) = 2000 + 150 = 2150
    expect(summary.totalInventoryValue).toBe(2150);
  });

  it("authorizes sellers via phone variants and rejects unauthorized senders", async () => {
    // 1. Exact match with same format
    const auth1 = await SellerAuthService.verifySeller(businessAId, "919876543210");
    expect(auth1.authorized).toBe(true);
    expect(auth1.userId).toBe(ownerUserId);

    // 2. International '+' format
    const auth2 = await SellerAuthService.verifySeller(businessAId, "+919876543210");
    expect(auth2.authorized).toBe(true);

    // 3. National 10-digit format
    const auth3 = await SellerAuthService.verifySeller(businessAId, "9876543210");
    expect(auth3.authorized).toBe(true);

    // 4. Authorized user checks against Business B where they are NOT a member
    const authWrongBiz = await SellerAuthService.verifySeller(businessBId, "919876543210");
    expect(authWrongBiz.authorized).toBe(false);
    expect(authWrongBiz.reason).toBe("NOT_A_BUSINESS_MEMBER");

    // 5. Completely unknown customer phone number
    const authUnknown = await SellerAuthService.verifySeller(businessAId, "919999999999");
    expect(authUnknown.authorized).toBe(false);
    expect(authUnknown.reason).toBe("USER_NOT_FOUND");
  });
});
