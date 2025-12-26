import { useRef, useCallback, useEffect } from "react";

import { type AnimeItem, type DetailCache } from "../types";
import { MIKAN_BASE } from "../constants";
import { decodeHtmlEntities } from "../utils";
import { MAGNET_HREF_PATTERN, COVER_PATTERN, DETAIL_FILE_SIZE_PATTERN } from "../patterns";

interface UseDetailPrefetchReturn {
  cache: Record<string, DetailCache>;
  handleSelectionChange: (itemId: string | null) => Promise<void>;
  getCachedMagnet: (url: string) => string | null | undefined;
}

/**
 * 详情预取 Hook
 * 提供选中项的详情（封面、文件大小、磁力链）预取功能
 */
export function useDetailPrefetch(
  items: AnimeItem[],
  setItems: React.Dispatch<React.SetStateAction<AnimeItem[]>>
): UseDetailPrefetchReturn {
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
    itemsRef.current = items;
  }, [items]);

  const handleSelectionChange = useCallback(
    async (itemId: string | null) => {
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
    },
    [setItems]
  );

  handleSelectionChangeRef.current = handleSelectionChange;

  // 初始预取第一个项目
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

  const getCachedMagnet = useCallback((url: string): string | null | undefined => {
    return cacheRef.current[url]?.magnet;
  }, []);

  return {
    cache: cacheRef.current,
    handleSelectionChange,
    getCachedMagnet,
  };
}
