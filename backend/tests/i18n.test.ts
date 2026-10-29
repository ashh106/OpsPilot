import { describe, it, expect } from "vitest";
import {
  resolveLanguage,
  t,
  isAffirmativeInput,
  isRejectionInput,
  renderSellerMenu,
} from "../src/i18n/index.js";

describe("i18n Localization Foundation", () => {
  it("resolves supported languages accurately", () => {
    expect(resolveLanguage("en")).toBe("en");
    expect(resolveLanguage("hi")).toBe("hi");
    expect(resolveLanguage("mr")).toBe("mr");
    expect(resolveLanguage("HI")).toBe("hi");
  });

  it("falls back to business default or English when requested is unsupported", () => {
    expect(resolveLanguage("es", "hi")).toBe("hi");
    expect(resolveLanguage("fr", "de")).toBe("en");
    expect(resolveLanguage(null, "mr")).toBe("mr");
    expect(resolveLanguage(undefined, undefined)).toBe("en");
  });

  it("respects business supportedLanguages restriction", () => {
    expect(resolveLanguage("hi", "en", ["en", "mr"])).toBe("en");
    expect(resolveLanguage("mr", "en", ["en", "mr"])).toBe("mr");
  });

  it("interpolates parameters in translation strings", () => {
    const enText = t("en", "greeting", { businessName: "Sharma Kirana Store" });
    expect(enText).toBe("Welcome to Sharma Kirana Store!");

    const hiText = t("hi", "greeting", { businessName: "शर्मा किराना स्टोर" });
    expect(hiText).toBe("शर्मा किराना स्टोर में आपका स्वागत है!");

    const mrText = t("mr", "greeting", { businessName: "पाटील किराणा" });
    expect(mrText).toBe("पाटील किराणा मध्ये आपले स्वागत आहे!");
  });

  it("interpolates product and stock update strings", () => {
    const text = t("hi", "product_item", { name: "आलू", price: 30, stock: 50, unit: "kg" });
    expect(text).toContain("आलू");
    expect(text).toContain("₹30");
    expect(text).toContain("50 kg");
  });

  it("recognizes affirmative inputs across English, Hindi, and Marathi", () => {
    // English
    expect(isAffirmativeInput("yes")).toBe(true);
    expect(isAffirmativeInput("YES!")).toBe(true);
    expect(isAffirmativeInput("confirm")).toBe(true);
    expect(isAffirmativeInput("sure")).toBe(true);

    // Hindi
    expect(isAffirmativeInput("हाँ")).toBe(true);
    expect(isAffirmativeInput("हा")).toBe(true);
    expect(isAffirmativeInput("सही है")).toBe(true);
    expect(isAffirmativeInput("कर दो")).toBe(true);
    expect(isAffirmativeInput("haan")).toBe(true);
    expect(isAffirmativeInput("sahi hai")).toBe(true);

    // Marathi
    expect(isAffirmativeInput("होय")).toBe(true);
    expect(isAffirmativeInput("हो")).toBe(true);
    expect(isAffirmativeInput("बरोबर")).toBe(true);
    expect(isAffirmativeInput("नक्की")).toBe(true);
    expect(isAffirmativeInput("hoy")).toBe(true);
  });

  it("recognizes rejection inputs across English, Hindi, and Marathi", () => {
    // English
    expect(isRejectionInput("no")).toBe(true);
    expect(isRejectionInput("cancel")).toBe(true);
    expect(isRejectionInput("stop")).toBe(true);

    // Hindi
    expect(isRejectionInput("नहीं")).toBe(true);
    expect(isRejectionInput("नही")).toBe(true);
    expect(isRejectionInput("रद्द")).toBe(true);
    expect(isRejectionInput("nahi")).toBe(true);
    expect(isRejectionInput("mat karo")).toBe(true);

    // Marathi
    expect(isRejectionInput("नाही")).toBe(true);
    expect(isRejectionInput("नको")).toBe(true);
    expect(isRejectionInput("रद्द करा")).toBe(true);
    expect(isRejectionInput("nako")).toBe(true);
  });

  it("renders localized seller menu", () => {
    const enMenu = renderSellerMenu("en", "Fresh Mart");
    expect(enMenu).toContain("Welcome to Fresh Mart!");
    expect(enMenu).toContain("1. View Products");
    expect(enMenu).toContain("5. Inventory Summary");

    const hiMenu = renderSellerMenu("hi", "ताज़ा मार्ट");
    expect(hiMenu).toContain("ताज़ा मार्ट में आपका स्वागत है!");
    expect(hiMenu).toContain("1. सभी उत्पाद देखें");

    const mrMenu = renderSellerMenu("mr", "ताजी भाजी केंद्र");
    expect(mrMenu).toContain("ताजी भाजी केंद्र मध्ये आपले स्वागत आहे!");
    expect(mrMenu).toContain("1. सर्व उत्पादने पहा");
  });
});
