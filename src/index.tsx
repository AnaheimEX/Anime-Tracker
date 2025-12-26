import { ActionPanel, Action, List, showToast, Toast, open, Icon, Color, Clipboard } from "@raycast/api";
import { useState, useEffect, useRef, useCallback } from "react";
import Parser from "rss-parser";

// 工具函数：判断两个日期是否为同一天（本地时区）
const isSameLocalDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// 工具函数：解码 HTML 实体（包括命名实体和数字实体）
const decodeHtmlEntities = (text: string): string => {
  let result = text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");

  // 十进制数字实体: &#1234;
  result = result.replaceAll(/&#(\d+);/g, (_, dec) =>
    String.fromCodePoint(Number.parseInt(dec, 10))
  );

  // 十六进制数字实体: &#x1A2B;
  result = result.replaceAll(/&#x([0-9a-f]+);/gi, (_, hex) =>
    String.fromCodePoint(Number.parseInt(hex, 16))
  );

  return result;
};

// 工具函数：格式化日期，统一显示格式，处理缺失情况
const formatDate = (dateStr: string): string => {
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
};

interface AnimeItem {
  title: string;
  link: string;
  pubDate: string;
  torrentUrl?: string;
  guid?: string;
  animeName: string;
  isToday: boolean;
  // 以下字段通过二次抓取获得
  coverUrl?: string;
  fileSize?: string;
}

const parser = new Parser();
const RSS_URL = "https://mikanani.me/RSS/Classic";
const MIKAN_BASE = "https://mikanani.me";

export default function Command() {
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 用于缓存详情页数据，防止重复请求
  const cacheRef = useRef<Record<string, { coverUrl?: string; fileSize?: string; magnet?: string | null }>>({});
  // 用于追踪正在请求中的链接，防止重复请求
  const pendingRef = useRef<Set<string>>(new Set());
  // 用于防止闭包问题，始终读取最新的 items
  const itemsRef = useRef<AnimeItem[]>([]);
  // 用于请求 token，确保只有最新请求的结果被使用
  const requestTokenRef = useRef(0);
  // 用于存储 handleSelectionChange 的引用，供初始预取使用
  const handleSelectionChangeRef = useRef<((itemId: string | null) => Promise<void>) | null>(null);
  // 用于标记是否已完成初始预取
  const initialPrefetchDoneRef = useRef(false);

  useEffect(() => {
    async function fetchFeed() {
      try {
        const response = await fetch(`${RSS_URL}?t=${Date.now()}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        if (!response.ok) throw new Error("Network Error");

        const xmlText = await response.text();
        const feed = await parser.parseString(xmlText);
        
        const now = new Date();

        const parsedItems: AnimeItem[] = feed.items
          .filter((item) => item.link) // 过滤掉没有 link 的条目
          .map((item) => {
            const fullTitle = item.title || "";
            // 提取纯净的动画名
            let animeName = fullTitle;
            const nameMatch = /^\[.*?\]\s*(.*?)(?:\s-|\[|\()/u.exec(fullTitle);
            if (nameMatch?.[1]) {
              animeName = nameMatch[1].trim();
            }

            const itemDate = new Date(item.pubDate || 0);

            return {
              title: fullTitle,
              link: item.link || "",
              pubDate: item.pubDate || "",
              guid: item.guid,
              torrentUrl: item.enclosure?.url,
              animeName: animeName,
              isToday: isSameLocalDay(itemDate, now),
            };
          });

        // 截取前 50 条，避免列表过长
        setItems(parsedItems.slice(0, 50));
        setIsLoading(false);

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "请检查网络";
        showToast({ style: Toast.Style.Failure, title: "RSS 获取失败", message });
        setIsLoading(false);
      }
    }

    fetchFeed();
  }, []);

  // 同步 itemsRef，防止闭包读取旧值
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // --- 核心优化：当选中某一行时，去抓取它的封面、文件大小和磁力链 ---
  const handleSelectionChange = useCallback(async (itemId: string | null) => {
    if (!itemId) return;

    // 使用 itemsRef 避免闭包问题
    const list = itemsRef.current;
    const selectedItem = list.find((i) => (i.guid ?? i.link) === itemId);
    if (!selectedItem) return;

    const link = selectedItem.link;

    // 1. 如果缓存里有了，不需要再抓
    if (cacheRef.current[link]) {
      return;
    }

    // 2. 如果正在请求中，不需要再发起新请求
    if (pendingRef.current.has(link)) {
      return;
    }

    // 3. 递增 token，用于校验结果是否仍为当前请求
    const currentToken = ++requestTokenRef.current;

    // 4. 标记为正在请求
    pendingRef.current.add(link);

    // 5. 抓取网页并解析
    try {
        const res = await fetch(link);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();

        // 校验是否仍为当前请求，避免旧请求覆盖新数据
        if (requestTokenRef.current !== currentToken) {
          return;
        }

        // --- 精确匹配 .bangumi-poster 的背景图 ---
        const coverMatch = /class="bangumi-poster[^"]*"[^>]*style="[^"]*background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/u.exec(html);
        let coverUrl = coverMatch?.[1];
        if (coverUrl?.startsWith("/")) {
            coverUrl = MIKAN_BASE + coverUrl;
        }

        // --- 提取文件大小 ---
        const fileSizeMatch = /class="bangumi-info"[^>]*>文件大小：([^<]+)</u.exec(html);
        const fileSize = fileSizeMatch?.[1]?.trim();

        // --- 提取磁力链接（用于缓存，避免 action 时重复请求）---
        const magnetMatch = /href="(magnet:\?xt=urn:btih:[^"]+)"/u.exec(html);
        const magnet = magnetMatch ? decodeHtmlEntities(magnetMatch[1]) : null;

        // 6. 写入缓存并更新 UI
        cacheRef.current[link] = { coverUrl, fileSize, magnet };

        // 更新 items 数组中的对应项
        setItems((prevItems) =>
            prevItems.map(item =>
                item.link === link ? { ...item, coverUrl, fileSize } : item
            )
        );

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "获取失败";
        console.error("Failed to fetch anime details:", message);
    } finally {
        // 7. 清除请求中标记
        pendingRef.current.delete(link);
    }
  }, []);

  // 更新 ref，供初始预取使用
  handleSelectionChangeRef.current = handleSelectionChange;

  // 初始预取第一条：当 items 首次加载完成时，自动预取第一条的详情
  useEffect(() => {
    if (items.length > 0 && !initialPrefetchDoneRef.current) {
      initialPrefetchDoneRef.current = true;
      const firstItem = items[0];
      const firstId = firstItem.guid ?? firstItem.link;
      // 延迟一帧确保 itemsRef 已更新
      setTimeout(() => {
        handleSelectionChangeRef.current?.(firstId);
      }, 0);
    }
  }, [items]);

  // 获取磁力链
  const getMagnetLink = async (detailUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(detailUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      // 要求 32-40 位 hash（Base32/Hex），并允许后续参数
      const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'<\s]*/u;
      const match = magnetRegex.exec(html);
      return match ? match[0] : null;
    } catch (error: unknown) {
      console.error("Failed to get magnet link:", error instanceof Error ? error.message : error);
      return null;
    }
  };

  const handleAction = async (item: AnimeItem, mode: "browser_pikpak" | "download" | "copy") => {
    // 优先使用缓存的 magnet
    const cached = cacheRef.current[item.link];
    let magnet = cached?.magnet;

    // 只有缓存中没有（undefined）才去抓取
    // 注意：null 表示已尝试但未找到，不需要重新抓取
    if (magnet === undefined) {
      const toast = await showToast({ style: Toast.Style.Animated, title: "解析磁力链..." });
      magnet = await getMagnetLink(item.link);
      // 存入缓存（即使是 null 也存，避免重复请求）
      if (cached) {
        cached.magnet = magnet;
      } else {
        cacheRef.current[item.link] = { magnet };
      }
      toast.hide();
    }

    // 处理没有 magnet 的情况
    if (!magnet) {
      if (item.torrentUrl && mode === "download") {
        open(item.torrentUrl);
        await showToast({ style: Toast.Style.Success, title: "已下载种子" });
        return;
      }
      open(item.link);
      await showToast({ style: Toast.Style.Failure, title: "直接打开网页" });
      return;
    }

    // 有 magnet，执行对应操作
    if (mode === "browser_pikpak") {
      await Clipboard.copy(magnet);
      await open(item.link);
      await showToast({ style: Toast.Style.Success, title: "复制成功 & 打开网页" });
    } else if (mode === "download") {
      open(magnet);
      await showToast({ style: Toast.Style.Success, title: "已唤起下载" });
    } else {
      await Clipboard.copy(magnet);
      await showToast({ style: Toast.Style.Success, title: "已复制" });
    }
  };

  const todayItems = items.filter(i => i.isToday);
  const otherItems = items.filter(i => !i.isToday);

  return (
    <List 
      isLoading={isLoading} 
      searchBarPlaceholder="搜索番剧..." 
      isShowingDetail
      onSelectionChange={handleSelectionChange} // 绑定选中事件
    >
      <List.Section title="📅 今日更新" subtitle={`${todayItems.length} 部`}>
        {todayItems.map((item) => (
          <AnimeListItem key={item.guid ?? item.link} item={item} onAction={handleAction} />
        ))}
      </List.Section>

      <List.Section title="🕒 近期更新">
        {otherItems.map((item) => (
          <AnimeListItem key={item.guid ?? item.link} item={item} onAction={handleAction} />
        ))}
      </List.Section>
    </List>
  );
}

function AnimeListItem({ item, onAction }: Readonly<{ item: AnimeItem; onAction: (item: AnimeItem, mode: "browser_pikpak" | "download" | "copy") => Promise<void> }>) {
  // 构建 Markdown
  // 1. 如果有封面图，显示图片
  const imageMarkdown = item.coverUrl ? `![封面](${item.coverUrl})` : "";
  // 2. 文件大小信息
  const fileSizeMarkdown = item.fileSize ? `**文件大小**: ${item.fileSize}` : "";

  const detailMarkdown = `
${imageMarkdown}

# ${item.animeName}

**更新时间**: ${formatDate(item.pubDate)}

${fileSizeMarkdown}

---
**原始文件**: ${item.title}
  `;

  return (
    <List.Item
      id={item.guid ?? item.link} // 必须有 id 才能触发 selectionChange
      title={item.animeName}
      subtitle={item.isToday ? "今日更新" : ""}
      // 列表左侧小图标
      icon={{ source: Icon.Video, tintColor: item.isToday ? Color.Green : Color.SecondaryText }}
      detail={
        <List.Item.Detail
          markdown={detailMarkdown}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="状态" text={item.isToday ? "🔥 连载中" : "已发布"} />
              <List.Item.Detail.Metadata.Label title="字幕组" text={/^\[(.*?)\]/u.exec(item.title)?.[1] ?? "未知"} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link title="Mikan 详情" target={item.link} text="查看网页" />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section title="推荐操作">
            <Action 
              title="Chrome / PikPak 播放" 
              icon={Icon.Globe} 
              onAction={() => onAction(item, "browser_pikpak")} 
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="其他">
            <Action title="本地下载" icon={Icon.Download} onAction={() => onAction(item, "download")} />
            <Action title="复制磁力链" icon={Icon.Clipboard} onAction={() => onAction(item, "copy")} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}