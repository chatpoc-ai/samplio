import english from "./en.json";
let language = (() => {
  try {
    return localStorage.getItem("samplio-language") === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
})();
export const getLanguage = () => language;
export const getLocale = () => (language === "zh" ? "zh-CN" : "en-US");
export function changeLanguage(next) {
  language = next === "zh" ? "zh" : "en";
  try {
    localStorage.setItem("samplio-language", language);
  } catch {}
  document.documentElement.lang = getLocale();
  window.dispatchEvent(new Event("samplio-language"));
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(english)
  .filter(([key]) => key.includes("{0}"))
  .map(([key, value]) => ({
    re: new RegExp(
      "^" +
        key
          .split(/\{\d+\}/)
          .map(escape)
          .join("(.+?)") +
        "$",
    ),
    value,
  }));
export function t(value) {
  if (typeof value !== "string" || language === "zh") return value;
  if (Object.hasOwn(english, value)) return english[value];
  for (const { re, value: translated } of patterns) {
    const match = value.match(re);
    if (match)
      return translated.replace(/\{(\d+)\}/g, (_, i) => t(match[+i + 1]));
  }
  return value;
}
export function translateForLanguage(value, lang) {
  return lang === "en" ? (english[value] ?? value) : value;
}
