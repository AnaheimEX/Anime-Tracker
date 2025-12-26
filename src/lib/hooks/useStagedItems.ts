import { useState, useCallback } from "react";
import { showToast, Toast, Clipboard } from "@raycast/api";

interface StagedItem {
  guid?: string;
  link: string;
}

interface UseStagedItemsReturn<T extends StagedItem> {
  stagedItems: T[];
  handleStage: (item: T) => void;
  handleUnstage: (item: T) => void;
  handleCopyAllMagnets: () => Promise<void>;
  isStaged: (item: T) => boolean;
  clearStaged: () => void;
}

/**
 * 暂存管理 Hook
 * 提供暂存项目的增删改查和批量复制磁力链功能
 */
export function useStagedItems<T extends StagedItem>(
  getMagnetLink: (url: string) => Promise<string | null>
): UseStagedItemsReturn<T> {
  const [stagedItems, setStagedItems] = useState<T[]>([]);

  const getItemKey = (item: StagedItem): string => item.guid ?? item.link;

  const handleStage = useCallback((item: T) => {
    setStagedItems((prev) => {
      if (prev.some((i) => getItemKey(i) === getItemKey(item))) {
        showToast({ style: Toast.Style.Failure, title: "已在暂存列表中" });
        return prev;
      }
      showToast({ style: Toast.Style.Success, title: "已加入暂存" });
      return [...prev, item];
    });
  }, []);

  const handleUnstage = useCallback((item: T) => {
    setStagedItems((prev) => prev.filter((i) => getItemKey(i) !== getItemKey(item)));
    showToast({ style: Toast.Style.Success, title: "已从暂存移除" });
  }, []);

  const isStaged = useCallback(
    (item: T): boolean => {
      return stagedItems.some((s) => getItemKey(s) === getItemKey(item));
    },
    [stagedItems]
  );

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

  const clearStaged = useCallback(() => {
    setStagedItems([]);
  }, []);

  return {
    stagedItems,
    handleStage,
    handleUnstage,
    handleCopyAllMagnets,
    isStaged,
    clearStaged,
  };
}
