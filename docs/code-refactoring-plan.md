# 代码整改计划

基于 Clean Code 原则对 `src/index.tsx` 和 `src/anime-search.tsx` 进行重构。

---

## 一、提取共享模块（DRY 原则）

### 1.1 创建 `src/lib/utils.ts`

提取重复的工具函数：

```typescript
// src/lib/utils.ts

/**
 * 解码 HTML 实体
 * 支持命名实体 (&amp;, &lt; 等) 和数字实体 (&#1234;, &#x1A2B;)
 */
export function decodeHtmlEntities(text: string): string

/**
 * 格式化日期为中文格式
 * @example "2024/01/15 14:30"
 */
export function formatDate(dateStr: string): string

/**
 * 判断两个日期是否为同一天（本地时区）
 */
export function isSameLocalDay(a: Date, b: Date): boolean

/**
 * 从描述中提取文件大小
 * @example "[1.2GB]" -> "1.2GB"
 */
export function extractFileSize(description: string): string | undefined

/**
 * 从标题中提取字幕组名称
 * @example "[字幕组] 动漫名" -> "字幕组"
 */
export function extractSubGroup(title: string): string
```

### 1.2 创建 `src/lib/types.ts`

统一类型定义：

```typescript
// src/lib/types.ts

/** 操作模式 */
export type ActionMode = "browser_pikpak" | "download" | "copy";

/** 基础资源项 */
export interface BaseItem {
  title: string;
  link: string;
  pubDate: string;
  torrentUrl?: string;
  guid?: string;
}

/** RSS 动漫项（index.tsx 使用） */
export interface AnimeItem extends BaseItem {
  animeName: string;
  isToday: boolean;
  coverUrl?: string;
  fileSize?: string;
}

/** 番剧资源项（anime-search.tsx 使用） */
export interface BangumiItem extends BaseItem {
  description?: string;
}

/** 搜索结果 */
export interface SearchResult {
  id: string;
  name: string;
  coverUrl: string;
}

/** 详情缓存 */
export interface DetailCache {
  coverUrl?: string;
  fileSize?: string;
  magnet?: string | null;
}
```

### 1.3 创建 `src/lib/constants.ts`

集中管理常量：

```typescript
// src/lib/constants.ts

/** Mikan 主站地址 */
export const MIKAN_BASE = "https://mikanani.me";

/** Mikan 镜像站地址 */
export const MIKAN_MIRROR = "https://mikan.tangbai.cc";

/** RSS 订阅地址 */
export const RSS_URL = "https://mikanani.me/RSS/Classic";

/** 本地缓存配置 */
export const CACHE_KEY = "anime-rss-cache";

/** 缓存有效期：30 分钟 */
export const CACHE_MAX_AGE = 30 * 60 * 1000;

/** 列表最大显示数量 */
export const MAX_ITEMS = 50;

/** Grid 列数 */
export const GRID_COLUMNS = 5;
```

### 1.4 创建 `src/lib/patterns.ts`

集中管理正则表达式：

```typescript
// src/lib/patterns.ts

/**
 * 匹配 "[字幕组] 动漫名 - 集数" 格式中的动漫名
 * 捕获组 1: 动漫名
 */
export const ANIME_NAME_PATTERN = /^\[.*?\]\s*(.*?)(?:\s-|\[|\()/u;

/**
 * 匹配字幕组名称 "[字幕组]"
 * 捕获组 1: 字幕组名
 */
export const SUB_GROUP_PATTERN = /^\[([^\]]+)\]/;

/**
 * 匹配磁力链接
 * 要求 32-40 位 hash（Base32/Hex）
 */
export const MAGNET_PATTERN = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'<\s]*/u;

/**
 * 匹配 .bangumi-poster 的背景图 URL
 * 捕获组 1: 图片 URL
 */
export const COVER_PATTERN = /class="bangumi-poster[^"]*"[^>]*style="[^"]*background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/u;

/**
 * 匹配文件大小 [1.2GB]
 * 捕获组 1: 大小值
 */
export const FILE_SIZE_PATTERN = /\[([^\]]*[GMK]B[^\]]*)\]/i;

/**
 * 匹配详情页文件大小
 * 捕获组 1: 大小值
 */
export const DETAIL_FILE_SIZE_PATTERN = /class="bangumi-info"[^>]*>文件大小：([^<]+)</u;
```

---

## 二、提取自定义 Hooks（SRP 原则）

### 2.1 创建 `src/lib/hooks/useStagedItems.ts`

暂存管理逻辑：

```typescript
// src/lib/hooks/useStagedItems.ts

interface UseStagedItemsReturn<T> {
  stagedItems: T[];
  handleStage: (item: T) => void;
  handleUnstage: (item: T) => void;
  handleCopyAllMagnets: () => Promise<void>;
  isStaged: (item: T) => boolean;
}

export function useStagedItems<T extends { guid?: string; link: string }>(
  getMagnetLink: (url: string) => Promise<string | null>
): UseStagedItemsReturn<T>
```

### 2.2 创建 `src/lib/hooks/useAnimeRss.ts`

RSS 获取与缓存逻辑（index.tsx 专用）：

```typescript
// src/lib/hooks/useAnimeRss.ts

interface UseAnimeRssReturn {
  items: AnimeItem[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useAnimeRss(): UseAnimeRssReturn
```

### 2.3 创建 `src/lib/hooks/useDetailPrefetch.ts`

详情预取逻辑：

```typescript
// src/lib/hooks/useDetailPrefetch.ts

interface UseDetailPrefetchReturn {
  cache: Record<string, DetailCache>;
  handleSelectionChange: (itemId: string | null) => Promise<void>;
}

export function useDetailPrefetch(
  items: AnimeItem[],
  setItems: React.Dispatch<React.SetStateAction<AnimeItem[]>>
): UseDetailPrefetchReturn
```

### 2.4 创建 `src/lib/hooks/useMagnetCache.ts`

磁力链缓存逻辑：

```typescript
// src/lib/hooks/useMagnetCache.ts

interface UseMagnetCacheReturn {
  getMagnetLink: (detailUrl: string) => Promise<string | null>;
  getCachedMagnet: (url: string) => string | null | undefined;
}

export function useMagnetCache(): UseMagnetCacheReturn
```

---

## 三、提取共享组件

### 3.1 创建 `src/components/DetailMarkdown.ts`

详情 Markdown 生成函数：

```typescript
// src/components/DetailMarkdown.ts

interface DetailMarkdownParams {
  coverUrl?: string;
  animeName: string;
  pubDate: string;
  fileSize?: string;
  title: string;
}

export function buildDetailMarkdown(params: DetailMarkdownParams): string
```

### 3.2 创建 `src/components/AnimeActions.tsx`

共享的 ActionPanel 组件：

```typescript
// src/components/AnimeActions.tsx

interface AnimeActionsProps {
  onBrowserPikpak: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onCopyAll: () => void;
  isStaged: boolean;
  stagedCount: number;
}

export function AnimeActions(props: AnimeActionsProps): JSX.Element
```

---

## 四、重构组件 Props（参数封装）

### 4.1 使用 Context 管理共享状态

```typescript
// src/lib/context/StagedContext.tsx

interface StagedContextValue {
  stagedCount: number;
  onCopyAll: () => Promise<void>;
}

export const StagedContext = React.createContext<StagedContextValue>(...)
```

### 4.2 简化 ListItem Props

**重构前** (8 个参数)：
```typescript
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
```

**重构后** (3 个参数 + Context)：
```typescript
interface ResourceListItemProps {
  item: BangumiItem;
  bangumiInfo: { coverUrl: string; animeName: string };
  handlers: {
    onAction: (item: BangumiItem, mode: ActionMode) => Promise<void>;
    onStage: (item: BangumiItem) => void;
  };
  isStaged: boolean;
}
// stagedCount 和 onCopyAll 从 StagedContext 获取
```

---

## 五、代码质量改进

### 5.1 改进错误处理

```typescript
// 重构前：空 catch 块
} catch {
  // 缓存解析失败，忽略
}

// 重构后：记录错误
} catch (error) {
  console.warn("Cache parse failed:", error);
}
```

### 5.2 添加类型守卫

```typescript
// src/lib/guards.ts

export function isValidAnimeItem(item: unknown): item is AnimeItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "link" in item &&
    "title" in item
  );
}
```

---

## 六、文件结构

重构后的目录结构：

```
src/
├── index.tsx                    # 主命令（精简后）
├── anime-search.tsx             # 搜索命令（精简后）
├── lib/
│   ├── utils.ts                 # 工具函数
│   ├── types.ts                 # 类型定义
│   ├── constants.ts             # 常量
│   ├── patterns.ts              # 正则表达式
│   ├── guards.ts                # 类型守卫
│   ├── hooks/
│   │   ├── index.ts             # 导出所有 hooks
│   │   ├── useStagedItems.ts    # 暂存管理
│   │   ├── useAnimeRss.ts       # RSS 获取
│   │   ├── useDetailPrefetch.ts # 详情预取
│   │   └── useMagnetCache.ts    # 磁力链缓存
│   └── context/
│       └── StagedContext.tsx    # 暂存上下文
└── components/
    ├── DetailMarkdown.ts        # Markdown 生成
    └── AnimeActions.tsx         # 共享 Actions
```

---

## 七、执行顺序

| 阶段 | 任务 | 优先级 |
|-----|------|-------|
| 1 | 创建 `lib/types.ts` 和 `lib/constants.ts` | 🔴 高 |
| 2 | 创建 `lib/utils.ts` 和 `lib/patterns.ts` | 🔴 高 |
| 3 | 创建 `lib/hooks/useMagnetCache.ts` | 🔴 高 |
| 4 | 创建 `lib/hooks/useStagedItems.ts` | 🔴 高 |
| 5 | 创建 `components/DetailMarkdown.ts` | 🟡 中 |
| 6 | 重构 `index.tsx` 使用共享模块 | 🔴 高 |
| 7 | 重构 `anime-search.tsx` 使用共享模块 | 🔴 高 |
| 8 | 创建 `lib/hooks/useAnimeRss.ts` | 🟡 中 |
| 9 | 创建 `lib/hooks/useDetailPrefetch.ts` | 🟡 中 |
| 10 | 创建 Context 简化 props | 🟢 低 |
| 11 | 运行 `npm run build` 验证 | 🔴 高 |

---

## 八、验收标准

- [ ] 无重复代码（decodeHtmlEntities、formatDate 等只出现一次）
- [ ] 所有正则表达式有注释说明
- [ ] 组件 props 不超过 4 个参数
- [ ] 无魔法数字（全部使用常量）
- [ ] `npm run build` 无错误
- [ ] 无 `any` 类型
- [ ] 无类型断言
