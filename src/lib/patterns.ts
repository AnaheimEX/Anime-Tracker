/**
 * 匹配 "[字幕组] 动漫名 - 集数" 格式中的动漫名
 * 捕获组 1: 动漫名
 * @example "[字幕组] 我的动漫 - 01" -> "我的动漫"
 */
export const ANIME_NAME_PATTERN = /^\[.*?\]\s*(.*?)(?:\s-|\[|\()/u;

/**
 * 匹配字幕组名称 "[字幕组]"
 * 捕获组 1: 字幕组名
 * @example "[ANi] 动漫名" -> "ANi"
 */
export const SUB_GROUP_PATTERN = /^\[([^\]]+)\]/;

/**
 * 匹配磁力链接
 * 要求 32-40 位 hash（Base32 或 Hex 编码）
 * @example "magnet:?xt=urn:btih:ABC123..."
 */
export const MAGNET_PATTERN = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'<\s]*/u;

/**
 * 匹配带 href 属性的磁力链接
 * 捕获组 1: 完整磁力链接
 */
export const MAGNET_HREF_PATTERN = /href="(magnet:\?xt=urn:btih:[^"]+)"/u;

/**
 * 匹配 .bangumi-poster 的背景图 URL
 * 捕获组 1: 图片 URL 路径
 * @example style="background-image: url('/images/cover.jpg')"
 */
export const COVER_PATTERN =
  /class="bangumi-poster[^"]*"[^>]*style="[^"]*background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/u;

/**
 * 匹配文件大小（方括号内）
 * 捕获组 1: 大小值
 * @example "[1.2GB]" -> "1.2GB"
 */
export const FILE_SIZE_BRACKET_PATTERN = /\[([^\]]*[GMK]B[^\]]*)\]/i;

/**
 * 匹配详情页中的文件大小
 * 捕获组 1: 大小值
 * @example class="bangumi-info">文件大小：1.2GB<
 */
export const DETAIL_FILE_SIZE_PATTERN = /class="bangumi-info"[^>]*>文件大小：([^<]+)</u;

/**
 * 匹配搜索结果中的动漫项
 * 捕获组 1: 动漫 ID
 * 捕获组 2: 封面图路径
 * 捕获组 3: 动漫标题
 */
export const SEARCH_RESULT_PATTERN =
  /<li>\s*<a\s+href="\/Home\/Bangumi\/(\d+)"[^>]*>[\s\S]*?data-src="([^"]+)"[\s\S]*?class="an-text"[^>]*title="([^"]+)"/g;
