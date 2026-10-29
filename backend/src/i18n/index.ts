import { SupportedLanguage, SUPPORTED_LANGUAGES, TranslationDictionary, TranslationKey } from "./types.js";
import { en } from "./locales/en.js";
import { hi } from "./locales/hi.js";
import { mr } from "./locales/mr.js";

const DICTIONARIES: Record<SupportedLanguage, TranslationDictionary> = {
  en,
  hi,
  mr,
};

/**
 * Validates and resolves a language string to a supported locale.
 * Fallback chain: requested -> businessDefault -> "en".
 */
export function resolveLanguage(
  requested?: string | null,
  businessDefault?: string | null,
  businessSupported?: string[] | null,
): SupportedLanguage {
  const supported = (businessSupported && businessSupported.length > 0)
    ? businessSupported.filter((l): l is SupportedLanguage => SUPPORTED_LANGUAGES.includes(l as SupportedLanguage))
    : SUPPORTED_LANGUAGES;

  const req = requested?.toLowerCase().trim();
  if (req && supported.includes(req as SupportedLanguage)) {
    return req as SupportedLanguage;
  }

  const def = businessDefault?.toLowerCase().trim();
  if (def && supported.includes(def as SupportedLanguage)) {
    return def as SupportedLanguage;
  }

  return "en";
}

/**
 * Translates a key into the target language with string interpolation.
 * If the key is missing in the target language, falls back to English.
 */
export function t(
  lang: string | undefined | null,
  key: TranslationKey,
  params: Record<string, string | number> = {},
): string {
  const resolvedLang = resolveLanguage(lang);
  const dict = DICTIONARIES[resolvedLang] || en;
  let text = dict[key] ?? en[key] ?? String(key);

  for (const [paramKey, paramValue] of Object.entries(params)) {
    const placeholder = new RegExp(`{{${paramKey}}}`, "g");
    text = text.replace(placeholder, String(paramValue));
  }

  return text;
}

/**
 * Multilingual affirmative intent recognition (English, Hindi, Marathi).
 * Checks Devanagari script and romanized transliterations.
 */
export function isAffirmativeInput(text: string): boolean {
  const trimmed = text.trim().toLowerCase();

  // 1. English
  if (/^(yes|y|yep|yeah|sure|confirm|proceed|ok|okay|correct|right)(\b|!|\.|$)/i.test(trimmed)) {
    return true;
  }

  // 2. Hindi Devanagari & Romanized
  // हाँ, हा, सही है, कर दो, ठीक है, पुष्टि, अपडेट करो, ha, haan, haa, sahi, theek
  if (
    /^(हाँ|हा|सही है|कर दो|ठीक है|पुष्टि|अपडेट करो|हा कर दो|हाँ कर दो|ha|haa|haan|sahi|sahi hai|theek hai)(\b|!|\.|$)/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // 3. Marathi Devanagari & Romanized
  // होय, हो, बरोबर, करा, नक्की, पुष्टी करा, hoy, ho, barobar, nakki
  if (
    /^(होय|हो|बरोबर|करा|नक्की|पुष्टी करा|होय करा|हो करा|hoy|barobar|nakki)(\b|!|\.|$)/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Multilingual rejection intent recognition (English, Hindi, Marathi).
 */
export function isRejectionInput(text: string): boolean {
  const trimmed = text.trim().toLowerCase();

  // 1. English
  if (/^(no|n|nope|cancel|stop|abort|don't|dont|nevermind|back)(\b|!|\.|$)/i.test(trimmed)) {
    return true;
  }

  // 2. Hindi Devanagari & Romanized
  // नहीं, नही, रद्द, मत करो, ना, nahi, nahin, radd, mat karo, na
  if (
    /^(नहीं|नही|रद्द|मत करो|ना|nahi|nahin|radd|mat karo)(\b|!|\.|$)/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // 3. Marathi Devanagari & Romanized
  // नाही, नको, रद्द करा, नको करू, nako, radd kara
  if (
    /^(नाही|नको|रद्द करा|नको करू|nako|radd kara)(\b|!|\.|$)/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Generates the localized Seller Menu string.
 */
export function renderSellerMenu(lang: string, businessName: string): string {
  const greeting = t(lang, "greeting", { businessName });
  const title = t(lang, "seller_menu_title");
  const options = [
    t(lang, "menu_view_products"),
    t(lang, "menu_add_product"),
    t(lang, "menu_update_stock"),
    t(lang, "menu_update_price"),
    t(lang, "menu_inventory_summary"),
    t(lang, "menu_instructions"),
    t(lang, "menu_change_language"),
    t(lang, "menu_contact_human"),
  ].join("\n");

  return `${greeting}\n\n${title}\n\n${options}`;
}

export * from "./types.js";
