import React, { useCallback, useMemo } from "react";
import { List, showToast, Toast, open, Icon, Color, Clipboard } from "@raycast/api";

import {
  type AnimeItem,
  type ActionMode,
  extractSubGroup,
  useAnimeRss,
  useDetailPrefetch,
  useStagedItems,
  StagedContext,
  usePikPak,
} from "./lib";
import { buildDetailMarkdown } from "./components/DetailMarkdown";
import { AnimeActions } from "./components/AnimeActions";
import { hasCredentials } from "./lib/pikpak";

export default function Command() {
  const { items, setItems, isLoading } = useAnimeRss();
  const { handleSelectionChange, getCachedMagnet } = useDetailPrefetch(items, setItems);
  const { client: pikpakClient, isLoggedIn: isPikPakLoggedIn } = usePikPak();

  const getMagnetLinkWithCache = useCallback(
    async (detailUrl: string): Promise<string | null> => {
      const cached = getCachedMagnet(detailUrl);
      if (cached !== undefined) {
        return cached;
      }

      try {
        const { MAGNET_PATTERN, decodeHtmlEntities } = await import("./lib");
        const response = await fetch(detailUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();

        const match = MAGNET_PATTERN.exec(html);
        return match ? decodeHtmlEntities(match[0]) : null;
      } catch (error) {
        console.error("Failed to get magnet link:", error);
        return null;
      }
    },
    [getCachedMagnet]
  );

  const { stagedItems, handleStage, handleUnstage, handleCopyAllMagnets, isStaged } =
    useStagedItems<AnimeItem>(getMagnetLinkWithCache);

  const handleAction = useCallback(
    async (item: AnimeItem, mode: ActionMode) => {
      const toast = await showToast({ style: Toast.Style.Animated, title: "解析磁力链..." });
      const magnet = await getMagnetLinkWithCache(item.link);
      toast.hide();

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
    },
    [getMagnetLinkWithCache]
  );

  const handleSendToPikPak = useCallback(
    async (item: AnimeItem) => {
      if (!pikpakClient || !isPikPakLoggedIn) {
        await showToast({
          style: Toast.Style.Failure,
          title: "未登录 PikPak",
          message: "请先配置 PikPak 账号",
        });
        return;
      }

      const toast = await showToast({ style: Toast.Style.Animated, title: "解析磁力链..." });
      const magnet = await getMagnetLinkWithCache(item.link);

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
          message: item.animeName,
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
    [pikpakClient, isPikPakLoggedIn, getMagnetLinkWithCache]
  );

  const getItemKey = (item: AnimeItem): string => item.guid ?? item.link;

  const todayItems = items.filter((i) => i.isToday);
  const otherItems = items.filter((i) => !i.isToday);

  const contextValue = useMemo(
    () => ({ stagedCount: stagedItems.length, onCopyAll: handleCopyAllMagnets }),
    [stagedItems.length, handleCopyAllMagnets]
  );

  return (
    <StagedContext.Provider value={contextValue}>
      <List isLoading={isLoading} searchBarPlaceholder="搜索番剧..." isShowingDetail onSelectionChange={handleSelectionChange}>
        {stagedItems.length > 0 && (
          <List.Section title="📦 暂存列表" subtitle={`${stagedItems.length} 项`}>
            {stagedItems.map((item) => (
              <StagedListItem
                key={`staged-${getItemKey(item)}`}
                item={item}
                onAction={handleAction}
                onSendToPikPak={hasCredentials() && isPikPakLoggedIn ? handleSendToPikPak : undefined}
                onUnstage={() => handleUnstage(item)}
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
              onSendToPikPak={hasCredentials() && isPikPakLoggedIn ? handleSendToPikPak : undefined}
              onStage={() => handleStage(item)}
              isStaged={isStaged(item)}
            />
          ))}
        </List.Section>

        <List.Section title="🕒 近期更新">
          {otherItems.map((item) => (
            <AnimeListItem
              key={getItemKey(item)}
              item={item}
              onAction={handleAction}
              onSendToPikPak={hasCredentials() && isPikPakLoggedIn ? handleSendToPikPak : undefined}
              onStage={() => handleStage(item)}
              isStaged={isStaged(item)}
            />
          ))}
        </List.Section>
      </List>
    </StagedContext.Provider>
  );
}

interface AnimeListItemProps {
  item: AnimeItem;
  onAction: (item: AnimeItem, mode: ActionMode) => Promise<void>;
  onSendToPikPak?: (item: AnimeItem) => Promise<void>;
  onStage: () => void;
  isStaged: boolean;
}

function AnimeListItem({ item, onAction, onSendToPikPak, onStage, isStaged }: Readonly<AnimeListItemProps>) {
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
        <AnimeActions
          actions={{
            onBrowserPikpak: () => void onAction(item, "browser_pikpak"),
            onDownload: () => void onAction(item, "download"),
            onCopy: () => void onAction(item, "copy"),
            onSendToPikPak: onSendToPikPak ? () => void onSendToPikPak(item) : undefined,
          }}
          staging={{
            onStage: isStaged ? undefined : onStage,
            isStaged,
          }}
        />
      }
    />
  );
}

interface StagedListItemProps {
  item: AnimeItem;
  onAction: (item: AnimeItem, mode: ActionMode) => Promise<void>;
  onSendToPikPak?: (item: AnimeItem) => Promise<void>;
  onUnstage: () => void;
}

function StagedListItem({ item, onAction, onSendToPikPak, onUnstage }: Readonly<StagedListItemProps>) {
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
