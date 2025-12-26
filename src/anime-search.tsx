import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import Parser from "rss-parser";

import {
  type BangumiItem,
  type SearchResult,
  type ActionMode,
  MIKAN_MIRROR,
  GRID_COLUMNS,
  USER_AGENT,
  decodeHtmlEntities,
  extractFileSize,
  extractSubGroup,
  SEARCH_RESULT_PATTERN,
  useMagnetCache,
  useStagedItems,
  StagedContext,
  usePikPak,
} from "./lib";
import { buildDetailMarkdown } from "./components/DetailMarkdown";
import { AnimeActions } from "./components/AnimeActions";
import { hasCredentials } from "./lib/pikpak";

const parser = new Parser();

async function searchAnime(keyword: string): Promise<SearchResult[]> {
  const url = `${MIKAN_MIRROR}/Home/Search?searchstr=${encodeURIComponent(keyword)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // 重置正则表达式的 lastIndex（因为使用了全局标志）
  SEARCH_RESULT_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SEARCH_RESULT_PATTERN.exec(html)) !== null) {
    const [, id, coverPath, title] = match;
    results.push({
      id,
      coverUrl: MIKAN_MIRROR + coverPath,
      name: decodeHtmlEntities(title),
    });
  }

  return results;
}

export default function AnimeSearchCommand() {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!searchText.trim()) {
      setResults([]);
      return;
    }

    // 防抖：延迟 500ms 后才执行搜索
    const timeoutId = setTimeout(() => {
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
    }, 500);

    // 清理函数：如果 searchText 再次变化，取消上一次的定时器
    return () => clearTimeout(timeoutId);
  }, [searchText]);

  return (
    <Grid
      columns={GRID_COLUMNS}
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
                  url={`${MIKAN_MIRROR}/Home/Bangumi/${item.id}`}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </Grid>
  );
}

interface BangumiDetailProps {
  id: string;
  name: string;
  coverUrl: string;
}

function BangumiDetail({ id, name, coverUrl }: Readonly<BangumiDetailProps>) {
  const [items, setItems] = useState<BangumiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubGroup, setSelectedSubGroup] = useState<string>("all");

  const subGroups = [...new Set(items.map((item) => extractSubGroup(item.title)))];

  const filteredItems =
    selectedSubGroup === "all"
      ? items
      : items.filter((item) => extractSubGroup(item.title) === selectedSubGroup);

  const { getMagnetLink } = useMagnetCache();
  const { stagedItems, handleStage, handleUnstage, handleCopyAllMagnets, isStaged } =
    useStagedItems<BangumiItem>(getMagnetLink);
  const { client: pikpakClient, isLoggedIn: isPikPakLoggedIn } = usePikPak();

  useEffect(() => {
    async function fetchRss() {
      try {
        const rssUrl = `${MIKAN_MIRROR}/RSS/Bangumi?bangumiId=${id}`;
        const response = await fetch(rssUrl, {
          headers: { "User-Agent": USER_AGENT },
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

  const handleSendToPikPak = useCallback(
    async (item: BangumiItem) => {
      if (!pikpakClient || !isPikPakLoggedIn) {
        await showToast({
          style: Toast.Style.Failure,
          title: "未登录 PikPak",
          message: "请先配置 PikPak 账号",
        });
        return;
      }

      const toast = await showToast({ style: Toast.Style.Animated, title: "解析磁力链..." });
      const magnet = await getMagnetLink(item.link);

      if (!magnet) {
        toast.hide();
        await showToast({ style: Toast.Style.Failure, title: "无法获取磁力链" });
        return;
      }

      try {
        toast.title = "发送到 PikPak...";
        await pikpakClient.addOfflineTask(magnet);
        toast.hide();
        await showToast({
          style: Toast.Style.Success,
          title: "已添加到 PikPak",
          message: item.title,
        });
      } catch (error) {
        toast.hide();
        await showToast({
          style: Toast.Style.Failure,
          title: "添加失败",
          message: error instanceof Error ? error.message : "未知错误",
        });
      }
    },
    [pikpakClient, isPikPakLoggedIn, getMagnetLink]
  );

  const getItemKey = (item: BangumiItem): string => item.guid ?? item.link;

  const contextValue = useMemo(
    () => ({ stagedCount: stagedItems.length, onCopyAll: handleCopyAllMagnets }),
    [stagedItems.length, handleCopyAllMagnets]
  );

  return (
    <StagedContext.Provider value={contextValue}>
      <List
        navigationTitle={name}
        isLoading={isLoading}
        isShowingDetail
        searchBarAccessory={
          <List.Dropdown
            tooltip="按字幕组过滤 (⌘P)"
            value={selectedSubGroup}
            onChange={setSelectedSubGroup}
          >
            <List.Dropdown.Item title="全部字幕组" value="all" />
            <List.Dropdown.Section title="字幕组">
              {subGroups.map((group) => (
                <List.Dropdown.Item key={group} title={group} value={group} />
              ))}
            </List.Dropdown.Section>
          </List.Dropdown>
        }
      >
        {stagedItems.length > 0 && (
          <List.Section title="📦 暂存列表" subtitle={`${stagedItems.length} 项`}>
            {stagedItems.map((item) => (
              <StagedListItem
                key={`staged-${getItemKey(item)}`}
                item={item}
                bangumiInfo={{ coverUrl, animeName: name }}
                onAction={handleAction}
                onSendToPikPak={hasCredentials() && isPikPakLoggedIn ? handleSendToPikPak : undefined}
                onUnstage={() => handleUnstage(item)}
              />
            ))}
          </List.Section>
        )}

        <List.Section title="📺 资源列表" subtitle={`${filteredItems.length} 个资源`}>
          {filteredItems.map((item) => (
            <ResourceListItem
              key={getItemKey(item)}
              item={item}
              bangumiInfo={{ coverUrl, animeName: name }}
              onAction={handleAction}
              onSendToPikPak={hasCredentials() && isPikPakLoggedIn ? handleSendToPikPak : undefined}
              staging={{ onStage: () => handleStage(item), isStaged: isStaged(item) }}
            />
          ))}
        </List.Section>
      </List>
    </StagedContext.Provider>
  );
}

interface BangumiInfo {
  coverUrl: string;
  animeName: string;
}

interface StagingHandlers {
  onStage: () => void;
  isStaged: boolean;
}

interface ResourceListItemProps {
  item: BangumiItem;
  bangumiInfo: BangumiInfo;
  onAction: (item: BangumiItem, mode: ActionMode) => Promise<void>;
  onSendToPikPak?: (item: BangumiItem) => Promise<void>;
  staging: StagingHandlers;
}

function ResourceListItem({
  item,
  bangumiInfo,
  onAction,
  onSendToPikPak,
  staging,
}: Readonly<ResourceListItemProps>) {
  const fileSize = extractFileSize(item.description || item.title);
  const subGroup = extractSubGroup(item.title);

  const detailMarkdown = buildDetailMarkdown({
    coverUrl: bangumiInfo.coverUrl,
    animeName: bangumiInfo.animeName,
    pubDate: item.pubDate,
    fileSize,
    title: item.title,
  });

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
              <List.Item.Detail.Metadata.Label title="原始文件" text={item.title} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link title="详情页" target={item.link} text="查看网页" />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <AnimeActions
          actions={{
            onBrowserPikpak: () => void onAction(item, "browser_pikpak"),
            onDownload: () => void onAction(item, "download"),
            onCopy: () => void onAction(item, "copy"),
            onSendToPikPak: onSendToPikPak ? () => void onSendToPikPak(item) : undefined,
          }}
          staging={{
            onStage: staging.isStaged ? undefined : staging.onStage,
            isStaged: staging.isStaged,
          }}
        />
      }
    />
  );
}

interface StagedListItemProps {
  item: BangumiItem;
  bangumiInfo: BangumiInfo;
  onAction: (item: BangumiItem, mode: ActionMode) => Promise<void>;
  onSendToPikPak?: (item: BangumiItem) => Promise<void>;
  onUnstage: () => void;
}

function StagedListItem({
  item,
  bangumiInfo,
  onAction,
  onSendToPikPak,
  onUnstage,
}: Readonly<StagedListItemProps>) {
  const fileSize = extractFileSize(item.description || item.title);
  const subGroup = extractSubGroup(item.title);

  const detailMarkdown = buildDetailMarkdown({
    coverUrl: bangumiInfo.coverUrl,
    animeName: bangumiInfo.animeName,
    pubDate: item.pubDate,
    fileSize,
    title: item.title,
  });

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
              <List.Item.Detail.Metadata.Label title="原始文件" text={item.title} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link title="详情页" target={item.link} text="查看网页" />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <AnimeActions
          actions={{
            onBrowserPikpak: () => void onAction(item, "browser_pikpak"),
            onDownload: () => void onAction(item, "download"),
            onCopy: () => void onAction(item, "copy"),
            onSendToPikPak: onSendToPikPak ? () => void onSendToPikPak(item) : undefined,
          }}
          staging={{
            onUnstage,
            isStaged: true,
          }}
        />
      }
    />
  );
}
