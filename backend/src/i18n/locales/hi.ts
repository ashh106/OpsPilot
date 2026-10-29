import { TranslationDictionary } from "../types.js";

export const hi: TranslationDictionary = {
  // Navigation & Menus
  greeting: "{{businessName}} में आपका स्वागत है!",
  seller_menu_title: "दुकान प्रबंधन मेनू (1-8 विकल्प संख्या लिखकर भेजें):",
  menu_view_products: "1. सभी उत्पाद देखें (View Products)",
  menu_add_product: "2. नया उत्पाद जोड़ें (Add Product)",
  menu_update_stock: "3. स्टॉक अपडेट करें (Update Stock)",
  menu_update_price: "4. कीमत बदलें (Update Price)",
  menu_inventory_summary: "5. इन्वेंटरी सारांश (Inventory Summary)",
  menu_instructions: "6. निर्देश व सहायता (Help & Instructions)",
  menu_change_language: "7. भाषा बदलें (Change Language)",
  menu_contact_human: "8. सहायता टीम से संपर्क (Contact Support)",

  // Language Picker
  language_picker_title: "कृपया अपनी पसंदीदा भाषा चुनें:\n1. English\n2. हिंदी (Hindi)\n3. मराठी (Marathi)",
  language_changed: "भाषा सफलतापूर्वक हिंदी में सेट कर दी गई है।",
  unsupported_language: "क्षमा करें, यह भाषा इस व्यवसाय द्वारा समर्थित नहीं है।",

  // Inventory / Products
  no_products: "आपकी इन्वेंटरी में कोई सक्रिय उत्पाद नहीं मिला।",
  product_list_header: "वर्तमान उत्पाद सूची:",
  product_item: "• {{name}} — ₹{{price}} (स्टॉक: {{stock}} {{unit}})",
  product_created: "उत्पाद '{{name}}' ₹{{price}} की कीमत और {{stock}} {{unit}} स्टॉक के साथ सफलतापूर्वक जोड़ा गया।",
  stock_updated: "'{{name}}' का स्टॉक अब {{newStock}} {{unit}} कर दिया गया है (बदलाव: {{delta}})।",
  price_updated: "'{{name}}' की नई कीमत ₹{{newPrice}} अपडेट कर दी गई है।",
  inventory_summary_header: "{{businessName}} का इन्वेंटरी सारांश:",
  inventory_summary_item: "• कुल उत्पाद: {{totalProducts}}\n• कम स्टॉक वाले उत्पाद (<5): {{lowStockCount}}\n• कुल इन्वेंटरी मूल्य: ₹{{totalValue}}",

  // Confirmations & Proposals
  confirm_stock_adjustment: "कृपया पुष्टि करें: '{{name}}' का स्टॉक {{delta}} से बदलना है (नया स्टॉक {{newStock}} {{unit}} होगा)?\n\nस्वीकार करने के लिए 'हाँ' (YES) लिखें, या रद्द करने के लिए 'नहीं' (NO) लिखें।",
  confirm_price_update: "कृपया पुष्टि करें: '{{name}}' की कीमत ₹{{oldPrice}} से बदलकर ₹{{newPrice}} करनी है?\n\nस्वीकार करने के लिए 'हाँ' (YES) लिखें, या रद्द करने के लिए 'नहीं' (NO) लिखें।",
  confirm_product_creation: "कृपया पुष्टि करें: नया उत्पाद '{{name}}' कीमत ₹{{price}} और प्रारंभिक स्टॉक {{stock}} {{unit}} जोड़ना है?\n\nस्वीकार करने के लिए 'हाँ' (YES) लिखें, या रद्द करने के लिए 'नहीं' (NO) लिखें।",
  proposal_cancelled: "कार्रवाई रद्द कर दी गई। आपकी इन्वेंटरी में कोई बदलाव नहीं किया गया।",
  proposal_expired: "पुष्टि का समय समाप्त हो गया है। कृपया अपना अनुरोध दोबारा भेजें।",

  // Errors & Fallbacks
  unauthorized_seller: "यह फ़ोन नंबर {{businessName}} के इन्वेंटरी प्रबंधन के लिए अधिकृत नहीं है। कृपया व्यवस्थापक से संपर्क करें।",
  product_not_found: "उत्पाद '{{query}}' आपकी सूची में नहीं मिला।",
  insufficient_stock: "स्टॉक शून्य से कम नहीं किया जा सकता। वर्तमान स्टॉक {{currentStock}} {{unit}} है।",
  invalid_price: "कीमत सकारात्मक संख्या होनी चाहिए।",
  invalid_quantity: "मात्रा शून्य के अलावा एक पूर्ण संख्या होनी चाहिए।",
  invalid_input: "अमान्य विकल्प। कृपया मेनू में से संख्या चुनें या अपना विवरण लिखें।",
  ambiguous_voice_command: "आपकी वॉइस रिकॉर्डिंग सुनाई दी, लेकिन उत्पाद या मात्रा पूरी तरह स्पष्ट नहीं हो सकी। कृपया साफ़ आवाज़ में बोलें (जैसे: '10 किलो आलू जोड़ो')।",
  transcription_unavailable: "ऑडियो सेवा वर्तमान में अनुपलब्ध है। कृपया लिखकर भेजें।",
  generic_error: "अनपेक्षित त्रुटि हुई। कृपया कुछ समय बाद पुनः प्रयास करें।",
  human_handoff: "हमारी टीम का प्रतिनिधि जल्द ही आपसे संपर्क करेगा।",

  // Voice Instructions / Tutorials
  audio_tutorial_prompt: "वॉइस नोट से इन्वेंटरी अपडेट करने के लिए बोलें: '10 किलो आलू जोड़ो' या 'दूध की कीमत 60 रुपये करो'। किसी भी बदलाव से पहले आपसे हमेशा पुष्टि माँगी जाएगी।",
};
