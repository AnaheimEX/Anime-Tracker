// Types
export type { ActionMode, AnimeItem, BangumiItem, SearchResult, DetailCache, CachedData, BaseItem } from "./types";

// Constants
export {
  MIKAN_BASE,
  MIKAN_MIRROR,
  RSS_URL,
  CACHE_KEY,
  CACHE_MAX_AGE,
  MAX_ITEMS,
  GRID_COLUMNS,
  USER_AGENT,
} from "./constants";

// Utils
export {
  decodeHtmlEntities,
  isSameLocalDay,
  formatDate,
  extractFileSize,
  extractSubGroup,
} from "./utils";

// Patterns
export {
  ANIME_NAME_PATTERN,
  SUB_GROUP_PATTERN,
  MAGNET_PATTERN,
  MAGNET_HREF_PATTERN,
  COVER_PATTERN,
  FILE_SIZE_BRACKET_PATTERN,
  DETAIL_FILE_SIZE_PATTERN,
  SEARCH_RESULT_PATTERN,
} from "./patterns";

// Hooks
export { useMagnetCache, useStagedItems } from "./hooks";
