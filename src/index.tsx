import { ActionPanel, Action, List, showToast, Toast, open, Icon, Color, Clipboard, LocalStorage } from "@raycast/api";
import { useState, useEffect, useRef, useCallback } from "react";
import Parser from "rss-parser";

import {
  type AnimeItem,
  type ActionMode,
  type DetailCache,
  type CachedData,
  MIKAN_BASE,
  RSS_URL,
  CACHE_KEY,
  MAX_ITEMS,
  USER_AGENT,
  isSameLocalDay,
  decodeHtmlEntities,
  extractSubGroup,
  ANIME_NAME_PATTERN,
  MAGNET_HREF_PATTERN,
  COVER_PATTERN,
  DETAIL_FILE_SIZE_PATTERN,
} from "./lib";
import { buildDetailMarkdown } from "./components/DetailMarkdown";

const parser = new Parser();

export default function Command() {
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stagedItems, setStagedItems] = useState<AnimeItem[]>([]);

  // 用于缓存详情页数据，防止重复请求
  const cacheRef = useRef<Record<string, DetailCache>>({});
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
    const parseRssItems = (feed: Parser.Output<Record<string, unknown>>): AnimeItem[] => {
      const now = new Date();
      return feed.items
        .filter((item) => item.link)
        .map((item) => {
          const fullTitle = item.title || "";
          let animeName = fullTitle;
          const nameMatch = ANIME_NAME_PATTERN.exec(fullTitle);
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
        })
        .slice(0, MAX_ITEMS);
    };

    const fetchFromNetwork = async (): Promise<AnimeItem[] | null> => {
      try {
        const response = await fetch(`${RSS_URL}?t=${Date.now()}`, {
          headers: { "User-Agent": USER_AGENT },
        });
        if (!response.ok) throw new Error("Network Error");
        const xmlText = await response.text();
        const feed = await parser.parseString(xmlText);
        return parseRssItems(feed);
      } catch {
        return null;
      }
    };

    const saveToCache = async (data: AnimeItem[]) => {
      const cacheData: CachedData = { items: data, timestamp: Date.now() };
      await LocalStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    };

    const loadFromCache = async (): Promise<CachedData | null> => {
      try {
        const cached = await LocalStorage.getItem<string>(CACHE_KEY);
        if (cached) {
          return JSON.parse(cached) as CachedData;
        }
      } catch (error) {
        console.warn("Cache parse failed:", error);
      }
      return null;
    };

    async function initData() {
      const cached = await loadFromCache();

      if (cached?.items?.length) {
        const now = new Date();
        const itemsWithUpdatedDate = cached.items.map((item) => ({
          ...item,
          isToday: isSameLocalDay(new Date(item.pubDate), now),
        }));
        setItems(itemsWithUpdatedDate);
        setIsLoading(false);

        const freshItems = await fetchFromNetwork();
        if (freshItems) {
          setItems(freshItems);
          await saveToCache(freshItems);
        }
      } else {
        const freshItems = await fetchFromNetwork();
        if (freshItems) {
          setItems(freshItems);
          await saveToCache(freshItems);
        } else {
          showToast({ style: Toast.Style.Failure, title: "RSS 获取失败", message: "请检查网络" });
        }
        setIsLoading(false);
      }
    }

    initData();
  }, []);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const handleSelectionChange = useCallback(async (itemId: string | null) => {
    if (!itemId) return;

    const list = itemsRef.current;
    const selectedItem = list.find((i) => (i.guid ?? i.link) === itemId);
    if (!selectedItem) return;

    const link = selectedItem.link;

    if (cacheRef.current[link]) return;
    if (pendingRef.current.has(link)) return;

    const currentToken = ++requestTokenRef.current;
    pendingRef.current.add(link);

    try {
      const res = await fetch(link);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      if (requestTokenRef.current !== currentToken) return;

      const coverMatch = COVER_PATTERN.exec(html);
      let coverUrl = coverMatch?.[1];
      if (coverUrl?.startsWith("/")) {
        coverUrl = MIKAN_BASE + coverUrl;
      }

      const fileSizeMatch = DETAIL_FILE_SIZE_PATTERN.exec(html);
      const fileSize = fileSizeMatch?.[1]?.trim();

      const magnetMatch = MAGNET_HREF_PATTERN.exec(html);
      const magnet = magnetMatch ? decodeHtmlEntities(magnetMatch[1]) : null;

      cacheRef.current[link] = { coverUrl, fileSize, magnet };

      setItems((prevItems) =>
        prevItems.map((item) => (item.link === link ? { ...item, coverUrl, fileSize } : item))
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "获取失败";
      console.error("Failed to fetch anime details:", message);
    } finally {
      pendingRef.current.delete(link);
    }
  }, []);

  handleSelectionChangeRef.current = handleSelectionChange;

  useEffect(() => {
    if (items.length > 0 && !initialPrefetchDoneRef.current) {
      initialPrefetchDoneRef.current = true;
      const firstItem = items[0];
      const firstId = firstItem.guid ?? firstItem.link;
      setTimeout(() => {
        handleSelectionChangeRef.current?.(firstId);
      }, 0);
    }
  }, [items]);

  const getMagnetLink = async (detailUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(detailUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'<\s]*/u;
      const match = magnetRegex.exec(html);
      return match ? match[0] : null;
    } catch (error: unknown) {
      console.error("Failed to get magnet link:", error instanceof Error ? error.message : error);
      return null;
    }
  };

  const handleAction = async (item: AnimeItem, mode: ActionMode) => {
    const cached = cacheRef.current[item.link];
    let magnet = cached?.magnet;

    if (magnet === undefined) {
      const toast = await showToast({ style: Toast.Style.Animated, title: "解析磁力链..." });
      magnet = await getMagnetLink(item.link);
      if (cached) {
        cached.magnet = magnet;
      } else {
        cacheRef.current[item.link] = { magnet };
      }
      toast.hide();
    }

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

  const getItemKey = (item: AnimeItem): string => item.guid ?? item.link;

  const handleStage = useCallback((item: AnimeItem) => {
    setStagedItems((prev) => {
      if (prev.some((i) => getItemKey(i) === getItemKey(item))) {
        showToast({ style: Toast.Style.Failure, title: "已在暂存列表中" });
        return prev;
      }
      showToast({ style: Toast.Style.Success, title: "已加入暂存" });
      return [...prev, item];
    });
  }, []);

  const handleUnstage = useCallback((item: AnimeItem) => {
    setStagedItems((prev) => prev.filter((i) => getItemKey(i) !== getItemKey(item)));
    showToast({ style: Toast.Style.Success, title: "已从暂存移除" });
  }, []);

  const handleCopyAllMagnets = useCallback(async () => {
    if (stagedItems.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "没有暂存的项目" });
      return;
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: `正在获取 ${stagedItems.length} 个磁力链...` });
    const magnets: string[] = [];

    for (const item of stagedItems) {
      const cached = cacheRef.current[item.link];
      let magnet = cached?.magnet;

      if (magnet === undefined) {
        magnet = await getMagnetLink(item.link);
        if (cached) cached.magnet = magnet;
        else cacheRef.current[item.link] = { magnet };
      }

      if (magnet) magnets.push(magnet);
    }

    toast.hide();

    if (magnets.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "未找到任何磁力链" });
      return;
    }

    await Clipboard.copy(magnets.join("\n"));
    await showToast({
      style: Toast.Style.Success,
      title: `已复制 ${magnets.length} 个磁力链`,
      message: "暂存已清空",
    });

    setStagedItems([]);
  }, [stagedItems]);

  const todayItems = items.filter((i) => i.isToday);
  const otherItems = items.filter((i) => !i.isToday);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="搜索番剧..." isShowingDetail onSelectionChange={handleSelectionChange}>
      {stagedItems.length > 0 && (
        <List.Section title="📦 暂存列表" subtitle={`${stagedItems.length} 项`}>
          {stagedItems.map((item) => (
            <StagedListItem
              key={`staged-${getItemKey(item)}`}
              item={item}
              onAction={handleAction}
              onUnstage={handleUnstage}
              onCopyAll={handleCopyAllMagnets}
              stagedCount={stagedItems.length}
            />
          ))}
        </List.Section>
      )}

      <List.Section title="📅 今日更新" subtitle={`${todayItems.length} 部`}>
        {todayItems.map((item) => (
          <AnimeListItem
            key={getItemKey(item)}
            item={item}
            onAction={handleAction}
            onStage={handleStage}
            isStaged={stagedItems.some((s) => getItemKey(s) === getItemKey(item))}
            onCopyAll={handleCopyAllMagnets}
            stagedCount={stagedItems.length}
          />
        ))}
      </List.Section>

      <List.Section title="🕒 近期更新">
        {otherItems.map((item) => (
          <AnimeListItem
            key={getItemKey(item)}
            item={item}
            onAction={handleAction}
            onStage={handleStage}
            isStaged={stagedItems.some((s) => getItemKey(s) === getItemKey(item))}
            onCopyAll={handleCopyAllMagnets}
            stagedCount={stagedItems.length}
          />
        ))}
      </List.Section>
    </List>
  );
}

interface AnimeListItemProps {
  item: AnimeItem;
  onAction: (item: AnimeItem, mode: ActionMode) => Promise<void>;
  onStage: (item: AnimeItem) => void;
  isStaged: boolean;
  onCopyAll: () => Promise<void>;
  stagedCount: number;
}

function AnimeListItem({ item, onAction, onStage, isStaged, onCopyAll, stagedCount }: Readonly<AnimeListItemProps>) {
  const detailMarkdown = buildDetailMarkdown({
    coverUrl: item.coverUrl,
    animeName: item.animeName,
    pubDate: item.pubDate,
    fileSize: item.fileSize,
    title: item.title,
  });

  return (
    <List.Item
      id={item.guid ?? item.link}
      title={item.animeName}
      subtitle={item.isToday ? "今日更新" : ""}
      icon={{ source: Icon.Video, tintColor: item.isToday ? Color.Green : Color.SecondaryText }}
      detail={
        <List.Item.Detail
          markdown={detailMarkdown}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="状态" text={item.isToday ? "🔥 连载中" : "已发布"} />
              <List.Item.Detail.Metadata.Label title="字幕组" text={extractSubGroup(item.title)} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link title="Mikan 详情" target={item.link} text="查看网页" />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section title="推荐操作">
            <Action title="Chrome / PikPak 播放" icon={Icon.Globe} onAction={() => onAction(item, "browser_pikpak")} />
            {!isStaged && (
              <Action
                title="加入暂存"
                icon={Icon.Plus}
                shortcut={{ modifiers: ["cmd"], key: "s" }}
                onAction={() => onStage(item)}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section title="其他">
            <Action title="本地下载" icon={Icon.Download} onAction={() => onAction(item, "download")} />
            <Action title="复制磁力链" icon={Icon.Clipboard} onAction={() => onAction(item, "copy")} />
          </ActionPanel.Section>
          <ActionPanel.Section title="暂存">
            <Action
              title={stagedCount > 0 ? `复制全部 ${stagedCount} 个磁力链` : "复制全部磁力链"}
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              onAction={onCopyAll}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

interface StagedListItemProps {
  item: AnimeItem;
  onAction: (item: AnimeItem, mode: ActionMode) => Promise<void>;
  onUnstage: (item: AnimeItem) => void;
  onCopyAll: () => Promise<void>;
  stagedCount: number;
}

function StagedListItem({ item, onAction, onUnstage, onCopyAll, stagedCount }: Readonly<StagedListItemProps>) {
  const detailMarkdown = buildDetailMarkdown({
    coverUrl: item.coverUrl,
    animeName: item.animeName,
    pubDate: item.pubDate,
    fileSize: item.fileSize,
    title: item.title,
  });

  return (
    <List.Item
      id={`staged-${item.guid ?? item.link}`}
      title={item.animeName}
      subtitle="已暂存"
      icon={{ source: Icon.Bookmark, tintColor: Color.Orange }}
      detail={
        <List.Item.Detail
          markdown={detailMarkdown}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="状态" text="📦 已暂存" />
              <List.Item.Detail.Metadata.Label title="字幕组" text={extractSubGroup(item.title)} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link title="Mikan 详情" target={item.link} text="查看网页" />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section title="暂存操作">
            <Action
              title={`复制全部 ${stagedCount} 个磁力链`}
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              onAction={onCopyAll}
            />
            <Action
              title="从暂存移除"
              icon={Icon.Minus}
              shortcut={{ modifiers: ["cmd"], key: "d" }}
              onAction={() => onUnstage(item)}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="单项操作">
            <Action title="Chrome / PikPak 播放" icon={Icon.Globe} onAction={() => onAction(item, "browser_pikpak")} />
            <Action title="本地下载" icon={Icon.Download} onAction={() => onAction(item, "download")} />
            <Action title="复制磁力链" icon={Icon.Clipboard} onAction={() => onAction(item, "copy")} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
