import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { loadMessages, type Locale } from "@senvori/i18n";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale as Locale),
  };
});
