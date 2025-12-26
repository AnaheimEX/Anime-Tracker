import { type AnimeItem, type BangumiItem, type BaseItem, type CachedData } from "./types";

/**
 * 检查是否为有效的基础资源项
 */
export function isValidBaseItem(item: unknown): item is BaseItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "link" in item &&
    typeof (item as BaseItem).link === "string" &&
    "title" in item &&
    typeof (item as BaseItem).title === "string"
  );
}

/**
 * 检查是否为有效的 AnimeItem
 */
export function isValidAnimeItem(item: unknown): item is AnimeItem {
  return (
    isValidBaseItem(item) &&
    "animeName" in item &&
    typeof (item as AnimeItem).animeName === "string" &&
    "isToday" in item &&
    typeof (item as AnimeItem).isToday === "boolean"
  );
}

/**
 * 检查是否为有效的 BangumiItem
 */
export function isValidBangumiItem(item: unknown): item is BangumiItem {
  return isValidBaseItem(item);
}

/**
 * 检查是否为非空字符串
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 检查是否为有效的 URL
 */
export function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查是否为有效的缓存数据
 */
export function isValidCachedData(data: unknown): data is CachedData {
  if (typeof data !== "object" || data === null) return false;
  if (!("items" in data) || !("timestamp" in data)) return false;

  const candidate = data as { items: unknown; timestamp: unknown };
  if (!Array.isArray(candidate.items)) return false;
  if (typeof candidate.timestamp !== "number") return false;

  return candidate.items.every(isValidAnimeItem);
}
