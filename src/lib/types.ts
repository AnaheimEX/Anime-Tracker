/** 操作模式 */
export type ActionMode = "browser_pikpak" | "download" | "copy";

/** 基础资源项 */
export interface BaseItem {
  title: string;
  link: string;
  pubDate: string;
  torrentUrl?: string;
  guid?: string;
}

/** RSS 动漫项（index.tsx 使用） */
export interface AnimeItem extends BaseItem {
  animeName: string;
  isToday: boolean;
  coverUrl?: string;
  fileSize?: string;
}

/** 番剧资源项（anime-search.tsx 使用） */
export interface BangumiItem extends BaseItem {
  description?: string;
}

/** 搜索结果 */
export interface SearchResult {
  id: string;
  name: string;
  coverUrl: string;
}

/** 详情缓存 */
export interface DetailCache {
  coverUrl?: string;
  fileSize?: string;
  magnet?: string | null;
}

/** 本地 RSS 缓存数据 */
export interface CachedData {
  items: AnimeItem[];
  timestamp: number;
}
