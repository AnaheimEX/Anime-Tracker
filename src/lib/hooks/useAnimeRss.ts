import { useState, useEffect } from "react";
import { LocalStorage, showToast, Toast } from "@raycast/api";
import Parser from "rss-parser";

import { type AnimeItem, type CachedData } from "../types";
import { RSS_URL, CACHE_KEY, MAX_ITEMS, USER_AGENT } from "../constants";
import { isSameLocalDay } from "../utils";
import { ANIME_NAME_PATTERN } from "../patterns";
import { isValidCachedData } from "../guards";

const parser = new Parser();

interface UseAnimeRssReturn {
  items: AnimeItem[];
  setItems: React.Dispatch<React.SetStateAction<AnimeItem[]>>;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * RSS 获取与缓存 Hook
 * 提供 RSS 数据的获取、缓存和刷新功能
 */
export function useAnimeRss(): UseAnimeRssReturn {
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const loadFromCache = async (): Promise<{ items: AnimeItem[]; timestamp: number } | null> => {
    try {
      const cached = await LocalStorage.getItem<string>(CACHE_KEY);
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (isValidCachedData(parsed)) {
          return parsed;
        }
        console.warn("Invalid cache data structure");
      }
    } catch (error) {
      console.warn("Cache parse failed:", error);
    }
    return null;
  };

  const refresh = async () => {
    setIsLoading(true);
    const freshItems = await fetchFromNetwork();
    if (freshItems) {
      setItems(freshItems);
      await saveToCache(freshItems);
    } else {
      showToast({ style: Toast.Style.Failure, title: "刷新失败", message: "请检查网络" });
    }
    setIsLoading(false);
  };

  useEffect(() => {
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

  return { items, setItems, isLoading, refresh };
}
