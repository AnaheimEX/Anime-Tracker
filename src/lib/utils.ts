/**
 * 解码 HTML 实体
 * 支持命名实体 (&amp;, &lt; 等) 和数字实体 (&#1234;, &#x1A2B;)
 */
export function decodeHtmlEntities(text: string): string {
  let result = text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");

  // 十进制数字实体: &#1234;
  result = result.replaceAll(/&#(\d+);/g, (_: string, dec: string) =>
    String.fromCodePoint(Number.parseInt(dec, 10))
  );

  // 十六进制数字实体: &#x1A2B;
  result = result.replaceAll(/&#x([0-9a-f]+);/gi, (_: string, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16))
  );

  return result;
}

/**
 * 判断两个日期是否为同一天（本地时区）
 */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * 格式化日期为中文格式
 * @example "2024/01/15 14:30"
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "未知时间";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "未知时间";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * 从描述或标题中提取文件大小
 * @example "[1.2GB]" -> "1.2GB"
 */
export function extractFileSize(text: string): string | undefined {
  const match = /\[([^\]]*[GMK]B[^\]]*)\]/i.exec(text);
  return match?.[1];
}

/**
 * 从标题中提取字幕组名称
 * @example "[字幕组] 动漫名" -> "字幕组"
 */
export function extractSubGroup(title: string): string {
  const match = /^\[([^\]]+)\]/.exec(title);
  return match?.[1] ?? "未知";
}
