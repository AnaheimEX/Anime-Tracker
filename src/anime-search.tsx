import {
  ActionPanel,
  Action,
  Grid,
  List,
  showToast,
  Toast,
  Icon,
  Color,
  Clipboard,
  open,
} from "@raycast/api";
import { useState, useEffect, useRef, useCallback } from "react";
import Parser from "rss-parser";

// ============ 常量 ============
const MIKAN_BASE = "https://mikan.tangbai.cc";

// ============ 类型定义 ============
interface SearchResult {
  id: string;
  name: string;
  coverUrl: string;
}

interface BangumiItem {
  title: string;
  link: string;
  pubDate: string;
  torrentUrl?: string;
  guid?: string;
  description?: string;
}

type ActionMode = "browser_pikpak" | "download" | "copy";

// ============ 工具函数 ============
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

// 从描述中提取文件大小
const extractFileSize = (description: string): string | undefined => {
  const match = /\[([^\]]*[GMK]B[^\]]*)\]/i.exec(description);
  return match?.[1];
};

// ============ 搜索 API ============
async function searchAnime(keyword: string): Promise<SearchResult[]> {
  const url = `${MIKAN_BASE}/Home/Search?searchstr=${encodeURIComponent(keyword)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // 匹配搜索结果中的动漫项
  // <li><a href="/Home/Bangumi/1824">...<span data-src="...">...<div class="an-text" title="...">
  const regex =
    /<li>\s*<a\s+href="\/Home\/Bangumi\/(\d+)"[^>]*>[\s\S]*?data-src="([^"]+)"[\s\S]*?class="an-text"[^>]*title="([^"]+)"/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const [, id, coverPath, title] = match;
    results.push({
      id,
      coverUrl: MIKAN_BASE + coverPath,
      name: decodeHtmlEntities(title),
    });
  }

  return results;
}

// ============ 主命令：搜索界面 ============
export default function AnimeSearchCommand() {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!searchText.trim()) {
      setResults([]);
      return;
    }

    const doSearch = async () => {
      setIsLoading(true);
      try {
        const data = await searchAnime(searchText);
        setResults(data);
      } catch (error) {
        console.error("Search failed:", error);
        showToast({
          style: Toast.Style.Failure,
          title: "搜索失败",
          message: error instanceof Error ? error.message : "未知错误",
        });
      } finally {
        setIsLoading(false);
      }
    };

    doSearch();
  }, [searchText]);

  return (
    <Grid
      columns={5}
      aspectRatio="2/3"
      inset={Grid.Inset.Small}
      filtering={false}
      throttle={true}
      onSearchTextChange={setSearchText}
      isLoading={isLoading}
      searchBarPlaceholder="搜索动漫名称..."
    >
      {results.length === 0 && !isLoading ? (
        <Grid.EmptyView
          icon={Icon.MagnifyingGlass}
          title={searchText ? "未找到相关动漫" : "输入关键词搜索动漫"}
        />
      ) : (
        results.map((item) => (
          <Grid.Item
            key={item.id}
            content={item.coverUrl}
            title={item.name}
            actions={
              <ActionPanel>
                <Action.Push
                  title="查看资源"
                  icon={Icon.List}
                  target={<BangumiDetail id={item.id} name={item.name} coverUrl={item.coverUrl} />}
                />
                <Action.OpenInBrowser
                  title="在浏览器中打开"
                  url={`${MIKAN_BASE}/Home/Bangumi/${item.id}`}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </Grid>
  );
}

// ============ 作品详情界面 ============
interface BangumiDetailProps {
  id: string;
  name: string;
  coverUrl: string;
}

const parser = new Parser();

function BangumiDetail({ id, name, coverUrl }: Readonly<BangumiDetailProps>) {
  const [items, setItems] = useState<BangumiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stagedItems, setStagedItems] = useState<BangumiItem[]>([]);

  // 磁力链缓存
  const magnetCacheRef = useRef<Record<string, string | null>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    async function fetchRss() {
      try {
        const rssUrl = `${MIKAN_BASE}/RSS/Bangumi?bangumiId=${id}`;
        const response = await fetch(rssUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const xmlText = await response.text();
        const feed = await parser.parseString(xmlText);

        const bangumiItems: BangumiItem[] = feed.items
          .filter((item) => item.link)
          .map((item) => ({
            title: item.title || "",
            link: item.link || "",
            pubDate: item.pubDate || "",
            torrentUrl: item.enclosure?.url,
            guid: item.guid,
            description: item.contentSnippet || item.content || "",
          }));

        setItems(bangumiItems);
      } catch (error) {
        console.error("Failed to fetch RSS:", error);
        showToast({
          style: Toast.Style.Failure,
          title: "获取资源失败",
          message: error instanceof Error ? error.message : "未知错误",
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchRss();
  }, [id]);

  // 获取磁力链
  const getMagnetLink = useCallback(async (detailUrl: string): Promise<string | null> => {
    // 检查缓存
    if (magnetCacheRef.current[detailUrl] !== undefined) {
      return magnetCacheRef.current[detailUrl];
    }

    // 防止重复请求
    if (pendingRef.current.has(detailUrl)) {
      return null;
    }

    pendingRef.current.add(detailUrl);

    try {
      const response = await fetch(detailUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();

      const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'<\s]*/u;
      const match = magnetRegex.exec(html);
      const magnet = match ? decodeHtmlEntities(match[0]) : null;

      magnetCacheRef.current[detailUrl] = magnet;
      return magnet;
    } catch (error) {
      console.error("Failed to get magnet link:", error);
      magnetCacheRef.current[detailUrl] = null;
      return null;
    } finally {
      pendingRef.current.delete(detailUrl);
    }
  }, []);

  // 处理操作
  const handleAction = useCallback(
    async (item: BangumiItem, mode: ActionMode) => {
      const toast = await showToast({ style: Toast.Style.Animated, title: "解析磁力链..." });
      const magnet = await getMagnetLink(item.link);
      toast.hide();

      if (!magnet) {
        if (item.torrentUrl && mode === "download") {
          open(item.torrentUrl);
          await showToast({ style: Toast.Style.Success, title: "已下载种子" });
          return;
        }
        open(item.link);
        await showToast({ style: Toast.Style.Failure, title: "未找到磁力链，已打开网页" });
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
    },
    [getMagnetLink]
  );

  // 暂存操作
  const handleStage = useCallback((item: BangumiItem) => {
    setStagedItems((prev) => {
      if (prev.some((i) => (i.guid ?? i.link) === (item.guid ?? item.link))) {
        showToast({ style: Toast.Style.Failure, title: "已在暂存列表中" });
        return prev;
      }
      showToast({ style: Toast.Style.Success, title: "已加入暂存" });
      return [...prev, item];
    });
  }, []);

  const handleUnstage = useCallback((item: BangumiItem) => {
    setStagedItems((prev) => prev.filter((i) => (i.guid ?? i.link) !== (item.guid ?? item.link)));
    showToast({ style: Toast.Style.Success, title: "已从暂存移除" });
  }, []);

  // 批量复制所有暂存项的磁力链
  const handleCopyAllMagnets = useCallback(async () => {
    if (stagedItems.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "没有暂存的项目" });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `正在获取 ${stagedItems.length} 个磁力链...`,
    });

    const magnets: string[] = [];
    for (const item of stagedItems) {
      const magnet = await getMagnetLink(item.link);
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
  }, [stagedItems, getMagnetLink]);

  return (
    <List navigationTitle={name} isLoading={isLoading} isShowingDetail>
      {stagedItems.length > 0 && (
        <List.Section title="📦 暂存列表" subtitle={`${stagedItems.length} 项`}>
          {stagedItems.map((item) => (
            <StagedListItem
              key={`staged-${item.guid ?? item.link}`}
              item={item}
              coverUrl={coverUrl}
              animeName={name}
              onAction={handleAction}
              onUnstage={handleUnstage}
              onCopyAll={handleCopyAllMagnets}
              stagedCount={stagedItems.length}
            />
          ))}
        </List.Section>
      )}

      <List.Section title="📺 资源列表" subtitle={`${items.length} 个资源`}>
        {items.map((item) => (
          <ResourceListItem
            key={item.guid ?? item.link}
            item={item}
            coverUrl={coverUrl}
            animeName={name}
            onAction={handleAction}
            onStage={handleStage}
            isStaged={stagedItems.some((s) => (s.guid ?? s.link) === (item.guid ?? item.link))}
            onCopyAll={handleCopyAllMagnets}
            stagedCount={stagedItems.length}
          />
        ))}
      </List.Section>
    </List>
  );
}

// ============ 资源列表项 ============
interface ResourceListItemProps {
  item: BangumiItem;
  coverUrl: string;
  animeName: string;
  onAction: (item: BangumiItem, mode: ActionMode) => Promise<void>;
  onStage: (item: BangumiItem) => void;
  isStaged: boolean;
  onCopyAll: () => Promise<void>;
  stagedCount: number;
}

function ResourceListItem({
  item,
  coverUrl,
  animeName,
  onAction,
  onStage,
  isStaged,
  onCopyAll,
  stagedCount,
}: Readonly<ResourceListItemProps>) {
  const fileSize = extractFileSize(item.description || item.title);
  const subGroup = /^\[([^\]]+)\]/.exec(item.title)?.[1] ?? "未知";

  const detailMarkdown = `
![封面](${coverUrl})

# ${animeName}

**更新时间**: ${formatDate(item.pubDate)}

${fileSize ? `**文件大小**: ${fileSize}` : ""}

---
**原始文件**: ${item.title}
  `;

  return (
    <List.Item
      id={item.guid ?? item.link}
      title={item.title}
      icon={{ source: Icon.Document, tintColor: Color.Blue }}
      detail={
        <List.Item.Detail
          markdown={detailMarkdown}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="字幕组" text={subGroup} />
              {fileSize && <List.Item.Detail.Metadata.Label title="文件大小" text={fileSize} />}
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link title="详情页" target={item.link} text="查看网页" />
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
            <Action
              title="本地下载"
              icon={Icon.Download}
              onAction={() => onAction(item, "download")}
            />
            <Action
              title="复制磁力链"
              icon={Icon.Clipboard}
              onAction={() => onAction(item, "copy")}
            />
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

// ============ 暂存列表项 ============
interface StagedListItemProps {
  item: BangumiItem;
  coverUrl: string;
  animeName: string;
  onAction: (item: BangumiItem, mode: ActionMode) => Promise<void>;
  onUnstage: (item: BangumiItem) => void;
  onCopyAll: () => Promise<void>;
  stagedCount: number;
}

function StagedListItem({
  item,
  coverUrl,
  animeName,
  onAction,
  onUnstage,
  onCopyAll,
  stagedCount,
}: Readonly<StagedListItemProps>) {
  const fileSize = extractFileSize(item.description || item.title);
  const subGroup = /^\[([^\]]+)\]/.exec(item.title)?.[1] ?? "未知";

  const detailMarkdown = `
![封面](${coverUrl})

# ${animeName}

**更新时间**: ${formatDate(item.pubDate)}

${fileSize ? `**文件大小**: ${fileSize}` : ""}

---
**原始文件**: ${item.title}
  `;

  return (
    <List.Item
      id={`staged-${item.guid ?? item.link}`}
      title={item.title}
      subtitle="已暂存"
      icon={{ source: Icon.Bookmark, tintColor: Color.Orange }}
      detail={
        <List.Item.Detail
          markdown={detailMarkdown}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="状态" text="📦 已暂存" />
              <List.Item.Detail.Metadata.Label title="字幕组" text={subGroup} />
              {fileSize && <List.Item.Detail.Metadata.Label title="文件大小" text={fileSize} />}
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link title="详情页" target={item.link} text="查看网页" />
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
            <Action
              title="Chrome / PikPak 播放"
              icon={Icon.Globe}
              onAction={() => onAction(item, "browser_pikpak")}
            />
            <Action
              title="本地下载"
              icon={Icon.Download}
              onAction={() => onAction(item, "download")}
            />
            <Action
              title="复制磁力链"
              icon={Icon.Clipboard}
              onAction={() => onAction(item, "copy")}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
