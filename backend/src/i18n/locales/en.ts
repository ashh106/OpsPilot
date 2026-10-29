import { TranslationDictionary } from "../types.js";

export const en: TranslationDictionary = {
  // Navigation & Menus
  greeting: "Welcome to {{businessName}}!",
  seller_menu_title: "Store Management Menu (Reply with option number 1-8):",
  menu_view_products: "1. View Products",
  menu_add_product: "2. Add Product",
  menu_update_stock: "3. Update Stock",
  menu_update_price: "4. Update Price",
  menu_inventory_summary: "5. Inventory Summary",
  menu_instructions: "6. Help & Instructions",
  menu_change_language: "7. Change Language (भाषा बदला)",
  menu_contact_human: "8. Contact Support",

  // Language Picker
  language_picker_title: "Please choose your preferred language:\n1. English\n2. हिंदी (Hindi)\n3. मराठी (Marathi)",
  language_changed: "Language updated to English successfully.",
  unsupported_language: "Sorry, that language is not supported by this business.",

  // Inventory / Products
  no_products: "No active products found in your inventory.",
  product_list_header: "Current Products:",
  product_item: "• {{name}} — ₹{{price}} (Stock: {{stock}} {{unit}})",
  product_created: "Product '{{name}}' created successfully with price ₹{{price}} and stock {{stock}} {{unit}}.",
  stock_updated: "Stock for '{{name}}' updated to {{newStock}} {{unit}} (Delta: {{delta}}).",
  price_updated: "Price for '{{name}}' updated to ₹{{newPrice}}.",
  inventory_summary_header: "Inventory Summary for {{businessName}}:",
  inventory_summary_item: "• Total Products: {{totalProducts}}\n• Low Stock (<5): {{lowStockCount}}\n• Total Inventory Value: ₹{{totalValue}}",

  // Confirmations & Proposals
  confirm_stock_adjustment: "Please confirm: Adjust stock for '{{name}}' by {{delta}} (New stock will be {{newStock}} {{unit}})?\n\nReply YES to confirm or NO to cancel.",
  confirm_price_update: "Please confirm: Change price of '{{name}}' from ₹{{oldPrice}} to ₹{{newPrice}}?\n\nReply YES to confirm or NO to cancel.",
  confirm_product_creation: "Please confirm: Add new product '{{name}}' priced at ₹{{price}} with initial stock {{stock}} {{unit}}?\n\nReply YES to confirm or NO to cancel.",
  proposal_cancelled: "Action cancelled. No changes were made to your inventory.",
  proposal_expired: "The confirmation period has expired. Please repeat your request.",

  // Errors & Fallbacks
  unauthorized_seller: "This phone number is not authorized to manage inventory for {{businessName}}. Please contact the business owner.",
  product_not_found: "Product '{{query}}' was not found in your inventory.",
  insufficient_stock: "Cannot reduce stock below zero. Current stock is {{currentStock}} {{unit}}.",
  invalid_price: "Price must be a positive number.",
  invalid_quantity: "Quantity must be a non-zero whole number.",
  invalid_input: "Invalid command. Please select an option from the menu or describe your inventory update.",
  ambiguous_voice_command: "I heard your voice note, but could not determine the exact product or quantity with confidence. Please state the product name and quantity clearly (e.g., 'Add 10 kg potatoes').",
  transcription_unavailable: "Audio processing is temporarily unavailable. Please type your request.",
  generic_error: "An unexpected error occurred. Please try again later.",
  human_handoff: "A staff member will contact you shortly.",

  // Voice Instructions / Tutorials
  audio_tutorial_prompt: "To update inventory by voice, send a voice note saying: 'Add 10 kg potatoes' or 'Change milk price to 60'. You will always be asked for confirmation before any changes are saved.",
};
