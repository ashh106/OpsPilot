export type SupportedLanguage = "en" | "hi" | "mr";

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["en", "hi", "mr"];

export interface TranslationDictionary {
  // Navigation & Menus
  greeting: string;
  seller_menu_title: string;
  menu_view_products: string;
  menu_add_product: string;
  menu_update_stock: string;
  menu_update_price: string;
  menu_inventory_summary: string;
  menu_instructions: string;
  menu_change_language: string;
  menu_contact_human: string;

  // Language Picker
  language_picker_title: string;
  language_changed: string;
  unsupported_language: string;

  // Inventory / Products
  no_products: string;
  product_list_header: string;
  product_item: string; // "{{name}} - ₹{{price}} (Stock: {{stock}} {{unit}})"
  product_created: string; // "Product '{{name}}' created with price ₹{{price}} and initial stock {{stock}} {{unit}}."
  stock_updated: string; // "Stock for '{{name}}' updated to {{newStock}} {{unit}} (Delta: {{delta}})."
  price_updated: string; // "Price for '{{name}}' updated to ₹{{newPrice}}."
  inventory_summary_header: string;
  inventory_summary_item: string; // "Total Products: {{totalProducts}}, Low Stock (<5): {{lowStockCount}}, Total Stock Value: ₹{{totalValue}}"

  // Confirmations & Proposals
  confirm_stock_adjustment: string; // "Please confirm: Adjust stock of '{{name}}' by {{delta}} (New quantity will be {{newStock}} {{unit}})? Reply YES (हाँ / होय) to confirm or NO (नहीं / नाही) to cancel."
  confirm_price_update: string; // "Please confirm: Update price of '{{name}}' from ₹{{oldPrice}} to ₹{{newPrice}}? Reply YES (हाँ / होय) to confirm or NO (नहीं / नाही) to cancel."
  confirm_product_creation: string; // "Please confirm: Add new product '{{name}}' priced at ₹{{price}} with initial stock {{stock}} {{unit}}? Reply YES (हाँ / होय) to confirm or NO (नहीं / नाही) to cancel."
  proposal_cancelled: string;
  proposal_expired: string;

  // Errors & Fallbacks
  unauthorized_seller: string;
  product_not_found: string;
  insufficient_stock: string;
  invalid_price: string;
  invalid_quantity: string;
  invalid_input: string;
  ambiguous_voice_command: string;
  transcription_unavailable: string;
  generic_error: string;
  human_handoff: string;

  // Voice Instructions / Tutorials
  audio_tutorial_prompt: string;
}

export type TranslationKey = keyof TranslationDictionary;
