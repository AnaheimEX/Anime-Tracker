import { ActionPanel, Action, List, showToast, Toast, open, Icon, Color, Clipboard } from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import Parser from "rss-parser";

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
  intro?: string;
}

const parser = new Parser();
const RSS_URL = "https://mikanani.me/RSS/Classic";
const MIKAN_BASE = "https://mikanani.me";

export default function Command() {
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 用于缓存详情页数据，防止重复请求 { [link]: { cover, intro } }
  const cacheRef = useRef<Record<string, { cover?: string; intro?: string }>>({});
  // 用于追踪正在请求中的链接，防止重复请求
  const pendingRef = useRef<Set<string>>(new Set());

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
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        const parsedItems: AnimeItem[] = feed.items.map((item) => {
          const fullTitle = item.title || "";
          // 提取纯净的动画名
          let animeName = fullTitle;
          const nameMatch = /^\[.*?\]\s*(.*?)(?:\s-|\[|\()/u.exec(fullTitle);
          if (nameMatch?.[1]) {
            animeName = nameMatch[1].trim();
          }

          const itemTime = new Date(item.pubDate || "").getTime();

          return {
            title: fullTitle,
            link: item.link || "",
            pubDate: item.pubDate || "",
            guid: item.guid,
            torrentUrl: item.enclosure?.url,
            animeName: animeName,
            isToday: itemTime >= startOfToday,
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

  // --- 核心优化：当选中某一行时，去抓取它的封面和简介 ---
  const handleSelectionChange = async (itemId: string | null) => {
    if (!itemId) return;

    // 使用 itemId 匹配 guid 或 link（作为 fallback）
    const selectedItem = items.find((i) => (i.guid ?? i.link) === itemId);
    if (!selectedItem) return;

    // 1. 如果缓存里有了，不需要再抓
    if (cacheRef.current[selectedItem.link]) {
      return;
    }

    // 2. 如果正在请求中，不需要再发起新请求
    if (pendingRef.current.has(selectedItem.link)) {
      return;
    }

    // 3. 标记为正在请求
    pendingRef.current.add(selectedItem.link);

    // 4. 抓取网页并解析
    try {
        const res = await fetch(selectedItem.link);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();

        // --- 正则提取封面 ---
        // Mikan 封面通常在 style="background-image: url('/Images/...')"
        const coverMatch = /background-image:\s*url\('([^']+)'\)/u.exec(html);
        let coverUrl = coverMatch ? coverMatch[1] : undefined;
        if (coverUrl?.startsWith("/")) {
            coverUrl = MIKAN_BASE + coverUrl;
        }

        // --- 正则提取简介 ---
        // 简介通常在 <p class="bangumi-intro"> ... </p>
        const introMatch = /<p class="bangumi-intro">([\s\S]*?)<\/p>/u.exec(html);
        let intro = introMatch ? introMatch[1].replaceAll(/<br\s*\/?>/gi, "\n").replaceAll(/<[^>]+>/gu, "").trim() : "暂无简介";

        // 截断简介防止过长
        if (intro.length > 150) intro = intro.substring(0, 150) + "...";

        // 5. 写入缓存并更新 UI
        cacheRef.current[selectedItem.link] = { cover: coverUrl, intro };

        // 更新 items 数组中的对应项
        setItems((prevItems) =>
            prevItems.map(item =>
                item.link === selectedItem.link ? { ...item, coverUrl, intro } : item
            )
        );

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "获取失败";
        console.error("Failed to fetch anime details:", message);
        // 更新 UI 显示错误状态
        setItems((prevItems) =>
            prevItems.map(item =>
                item.link === selectedItem.link ? { ...item, intro: "获取简介失败" } : item
            )
        );
    } finally {
        // 6. 清除请求中标记
        pendingRef.current.delete(selectedItem.link);
    }
  };

  // 获取磁力链
  const getMagnetLink = async (detailUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(detailUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]*/u;
      const match = magnetRegex.exec(html);
      return match ? match[0] : null;
    } catch (error: unknown) {
      console.error("Failed to get magnet link:", error instanceof Error ? error.message : error);
      return null;
    }
  };

  const handleAction = async (item: AnimeItem, mode: "browser_pikpak" | "download" | "copy") => {
    const toast = await showToast({ style: Toast.Style.Animated, title: "解析磁力链..." });
    const magnet = await getMagnetLink(item.link);

    if (!magnet) {
      if (item.torrentUrl && mode === "download") {
         open(item.torrentUrl);
         toast.style = Toast.Style.Success;
         toast.title = "已下载种子";
         return;
      }
      open(item.link);
      toast.style = Toast.Style.Failure;
      toast.title = "直接打开网页";
      return;
    }

    if (mode === "browser_pikpak") {
      await Clipboard.copy(magnet);
      await open(item.link); 
      toast.style = Toast.Style.Success;
      toast.title = "复制成功 & 打开网页";
    } else if (mode === "download") {
      open(magnet);
      toast.style = Toast.Style.Success;
      toast.title = "已唤起下载";
    } else {
      await Clipboard.copy(magnet);
      toast.style = Toast.Style.Success;
      toast.title = "已复制";
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
  // 2. 简介区域
  const introMarkdown = item.intro ? `> ${item.intro}` : "> 正在获取简介...";

  const detailMarkdown = `
${imageMarkdown}

# ${item.animeName}

**更新时间**: ${new Date(item.pubDate).toLocaleString()}

---
${introMarkdown}

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