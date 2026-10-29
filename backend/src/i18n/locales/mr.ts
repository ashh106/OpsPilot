import { TranslationDictionary } from "../types.js";

export const mr: TranslationDictionary = {
  // Navigation & Menus
  greeting: "{{businessName}} मध्ये आपले स्वागत आहे!",
  seller_menu_title: "दुकान व्यवस्थापन मेनू (1 ते 8 पर्याय क्रमांक निवडा):",
  menu_view_products: "1. सर्व उत्पादने पहा (View Products)",
  menu_add_product: "2. नवीन उत्पादन जोडा (Add Product)",
  menu_update_stock: "3. स्टॉक अपडेट करा (Update Stock)",
  menu_update_price: "4. किंमत बदला (Update Price)",
  menu_inventory_summary: "5. इन्व्हेंटरी सारांश (Inventory Summary)",
  menu_instructions: "6. मदत व सूचना (Help & Instructions)",
  menu_change_language: "7. भाषा बदला (Change Language)",
  menu_contact_human: "8. सपोर्टशी संपर्क साधा (Contact Support)",

  // Language Picker
  language_picker_title: "कृपया आपली पसंतीची भाषा निवडा:\n1. English\n2. हिंदी (Hindi)\n3. मराठी (Marathi)",
  language_changed: "भाषा यशस्वीरित्या मराठीत सेट केली आहे.",
  unsupported_language: "क्षमस्व, ही भाषा या व्यवसायासाठी उपलब्ध नाही.",

  // Inventory / Products
  no_products: "आपल्या इन्व्हेंटरीमध्ये कोणतीही सक्रिय उत्पादने आढळली नाहीत.",
  product_list_header: "सध्याची उत्पादन सूची:",
  product_item: "• {{name}} — ₹{{price}} (स्टॉक: {{stock}} {{unit}})",
  product_created: "उत्पादन '{{name}}' ₹{{price}} किंमत आणि {{stock}} {{unit}} साठ्यासह यशस्वीरित्या जोडले गेले.",
  stock_updated: "'{{name}}' चा स्टॉक आता {{newStock}} {{unit}} झाला आहे (बदल: {{delta}}).",
  price_updated: "'{{name}}' ची नवीन किंमत ₹{{newPrice}} अपडेट झाली आहे.",
  inventory_summary_header: "{{businessName}} चा इन्व्हेंटरी सारांश:",
  inventory_summary_item: "• एकूण उत्पादने: {{totalProducts}}\n• कमी स्टॉक असलेली उत्पादने (<5): {{lowStockCount}}\n• एकूण इन्व्हेंटरी मूल्य: ₹{{totalValue}}",

  // Confirmations & Proposals
  confirm_stock_adjustment: "कृपया पुष्टी करा: '{{name}}' चा साठा {{delta}} ने बदलायचा आहे (नवीन साठा {{newStock}} {{unit}} होईल)?\n\nसंमती देण्यासाठी 'होय' (YES) लिहा, किंवा रद्द करण्यासाठी 'नाही' (NO) लिहा.",
  confirm_price_update: "कृपया पुष्टी करा: '{{name}}' ची किंमत ₹{{oldPrice}} वरून ₹{{newPrice}} करायची आहे?\n\nसंमती देण्यासाठी 'होय' (YES) लिहा, किंवा रद्द करण्यासाठी 'नाही' (NO) लिहा.",
  confirm_product_creation: "कृपया पुष्टी करा: नवीन उत्पादन '{{name}}' किंमत ₹{{price}} आणि सुरुवातीचा साठा {{stock}} {{unit}} जोडायचे आहे?\n\nसंमती देण्यासाठी 'होय' (YES) लिहा, किंवा रद्द करण्यासाठी 'नाही' (NO) लिहा.",
  proposal_cancelled: "कृती रद्द केली. आपल्या इन्व्हेंटरीमध्ये कोणताही बदल झालेला नाही.",
  proposal_expired: "पुष्टीकरणाची मुदत संपली आहे. कृपया आपली विनंती पुन्हा पाठवा.",

  // Errors & Fallbacks
  unauthorized_seller: "हा फोन नंबर {{businessName}} ची इन्व्हेंटरी व्यवस्थापित करण्यासाठी अधिकृत नाही. कृपया व्यवस्थापकाशी संपर्क साधा.",
  product_not_found: "उत्पादन '{{query}}' आपल्या सूचीत आढळले नाही.",
  insufficient_stock: "स्टॉक शून्यापेक्षा कमी करता येत नाही. सध्याचा स्टॉक {{currentStock}} {{unit}} आहे.",
  invalid_price: "किंमत धन संख्या असणे आवश्यक आहे.",
  invalid_quantity: "संख्या शून्याव्यतिरिक्त पूर्ण संख्या असावी.",
  invalid_input: "अवैध पर्याय. कृपया मेनूमधून पर्याय निवडा किंवा आपली विनंती स्पष्ट लिहा.",
  ambiguous_voice_command: "आपला व्हॉइस मेसेज ऐकू आला, परंतु उत्पादन किंवा प्रमाण स्पष्ट समजले नाही. कृपया स्पष्ट आवाजात सांगा (उदा. '10 किलो बटाटे जोडा').",
  transcription_unavailable: "ऑडिओ सेवा सध्या अनुपलब्ध आहे. कृपया टाईप करून पाठवा.",
  generic_error: "काही तांत्रिक अडचण आली. कृपया थोड्या वेळाने प्रयत्न करा.",
  human_handoff: "आमचे प्रतिनिधी लवकरच आपल्याशी संपर्क साधतील.",

  // Voice Instructions / Tutorials
  audio_tutorial_prompt: "व्हॉइस नोटद्वारे इन्व्हेंटरी अपडेट करण्यासाठी बोला: '10 किलो बटाटे जोडा' किंवा 'दुधाची किंमत 60 रुपये करा'. कोणत्याही बदलापूर्वी आपल्याकडून नेहमी पुष्टी घेतली जाईल.",
};
