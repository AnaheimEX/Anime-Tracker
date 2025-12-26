import { useRef, useCallback } from "react";
import { decodeHtmlEntities } from "../utils";
import { MAGNET_PATTERN } from "../patterns";

interface UseMagnetCacheReturn {
  getMagnetLink: (detailUrl: string) => Promise<string | null>;
  getCachedMagnet: (url: string) => string | null | undefined;
}

/**
 * 磁力链接缓存 Hook
 * 提供磁力链接的获取和缓存功能，避免重复请求
 */
export function useMagnetCache(): UseMagnetCacheReturn {
  const cacheRef = useRef<Record<string, string | null>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  const getMagnetLink = useCallback(async (detailUrl: string): Promise<string | null> => {
    // 检查缓存
    if (cacheRef.current[detailUrl] !== undefined) {
      return cacheRef.current[detailUrl];
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

      const match = MAGNET_PATTERN.exec(html);
      const magnet = match ? decodeHtmlEntities(match[0]) : null;

      cacheRef.current[detailUrl] = magnet;
      return magnet;
    } catch (error) {
      console.error("Failed to get magnet link:", error);
      cacheRef.current[detailUrl] = null;
      return null;
    } finally {
      pendingRef.current.delete(detailUrl);
    }
  }, []);

  const getCachedMagnet = useCallback((url: string): string | null | undefined => {
    return cacheRef.current[url];
  }, []);

  return { getMagnetLink, getCachedMagnet };
}
