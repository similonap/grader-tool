export const FEEDBACK_LANGUAGES = [
  "English",
  "Dutch",
  "German",
  "French",
  "Spanish",
  "Portuguese",
  "Italian",
  "Chinese",
  "Japanese",
];

export const CUSTOM_LANGUAGE = "Custom…";

/** Splits a saved language value into the `language`/`customLanguage` pair the picker state expects. */
export function resolveInitialLanguage(saved: string | null): { language: string; customLanguage: string } {
  if (saved && FEEDBACK_LANGUAGES.includes(saved)) return { language: saved, customLanguage: "" };
  if (saved) return { language: CUSTOM_LANGUAGE, customLanguage: saved };
  return { language: FEEDBACK_LANGUAGES[0], customLanguage: "" };
}
