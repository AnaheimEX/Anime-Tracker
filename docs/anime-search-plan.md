# Anime Search 功能实现计划

## 概述
为 Anime-Tracker 扩展添加 "Anime Search" 命令，允许用户搜索动漫作品，使用 **Grid 布局展示海报封面**，选择后进入资源列表页面。

---

## 用户交互流程

```
搜索界面 (Grid 海报墙)
    ↓ 用户选择
作品详情界面 (List 资源列表)
    ↓
暂存/复制磁力链
```

---

## 技术架构

### 第一层：搜索界面 (Grid)
- **组件**: `Grid` + `Grid.Item`
- **布局**: `columns={5}`, `aspectRatio="2/3"` (竖版海报)
- **搜索**: `onSearchTextChange` + `throttle={true}`
- **API**: `https://mikan.tangbai.cc/Home/Search?searchstr=<encoded>`

### 第二层：作品详情 (List)
- **组件**: 复用现有 `List` + `List.Item.Detail` 样式
- **导航**: `Action.Push` 传递 `bangumiId` 和 `animeName`
- **API**: `https://mikan.tangbai.cc/RSS/Bangumi?bangumiId=<ID>`

---

## 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 添加 `anime-search` 命令配置 |
| `src/anime-search.tsx` | 新建 | 搜索命令主入口 |

---

## 实现步骤

### Step 1: 修改 package.json
```json
{
  "name": "anime-search",
  "title": "Anime Search",
  "description": "Search anime from Mikan Project",
  "mode": "view"
}
```

### Step 2: 创建 src/anime-search.tsx

#### 2.1 类型定义
```typescript
interface SearchResult {
  id: string;           // "1824"
  name: string;         // "精灵宝可梦"
  coverUrl: string;     // 完整封面 URL
}

interface BangumiItem {
  title: string;        // 资源标题
  link: string;         // 详情页链接
  pubDate: string;      // 发布日期
  torrentUrl?: string;  // torrent 下载链接
  description?: string; // 包含文件大小
}
```

#### 2.2 搜索界面 (AnimeSearchCommand)
```typescript
export default function AnimeSearchCommand() {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 搜索逻辑：当 searchText 变化时触发
  useEffect(() => {
    if (!searchText.trim()) {
      setResults([]);
      return;
    }
    // 发起 HTTP 请求，解析 HTML
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
      <Grid.EmptyView
        icon={Icon.MagnifyingGlass}
        title="输入关键词搜索动漫"
      />
      {results.map((item) => (
        <Grid.Item
          key={item.id}
          content={item.coverUrl}
          title={item.name}
          actions={
            <ActionPanel>
              <Action.Push
                title="查看资源"
                target={<BangumiDetail id={item.id} name={item.name} />}
              />
            </ActionPanel>
          }
        />
      ))}
    </Grid>
  );
}
```

#### 2.3 HTML 解析逻辑
```typescript
const MIKAN_BASE = "https://mikan.tangbai.cc";

async function searchAnime(keyword: string): Promise<SearchResult[]> {
  const url = `${MIKAN_BASE}/Home/Search?searchstr=${encodeURIComponent(keyword)}`;
  const response = await fetch(url);
  const html = await response.text();

  const results: SearchResult[] = [];
  // 正则匹配：<a href="/Home/Bangumi/1824">...data-src="..."...title="..."
  const regex = /<li>\s*<a href="\/Home\/Bangumi\/(\d+)"[^>]*>.*?data-src="([^"]+)".*?title="([^"]+)"/gs;

  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push({
      id: match[1],
      coverUrl: MIKAN_BASE + match[2].split('?')[0], // 去掉 query 参数
      name: decodeHtmlEntities(match[3]),
    });
  }
  return results;
}
```

#### 2.4 作品详情界面 (BangumiDetail)
```typescript
interface BangumiDetailProps {
  id: string;
  name: string;
}

function BangumiDetail({ id, name }: BangumiDetailProps) {
  const [items, setItems] = useState<BangumiItem[]>([]);
  const [stagedItems, setStagedItems] = useState<BangumiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 请求 RSS: https://mikan.tangbai.cc/RSS/Bangumi?bangumiId=<id>
    // 使用 rss-parser 解析
  }, [id]);

  return (
    <List
      navigationTitle={name}
      isLoading={isLoading}
      isShowingDetail
    >
      {/* 暂存区 */}
      {stagedItems.length > 0 && (
        <List.Section title="📦 暂存列表">
          {/* ... */}
        </List.Section>
      )}
      {/* 资源列表 */}
      <List.Section title="📺 资源列表">
        {items.map((item) => (
          <List.Item
            key={item.link}
            title={item.title}
            detail={/* 复用现有样式 */}
            actions={/* 暂存、复制磁力链等 */}
          />
        ))}
      </List.Section>
    </List>
  );
}
```

#### 2.5 复用函数 (从 index.tsx 复制)
- `decodeHtmlEntities()` - HTML 实体解码
- `formatDate()` - 日期格式化
- `getMagnetLink()` - 获取磁力链
- 暂存相关状态和处理函数

---

## 关键实现细节

### HTML 解析目标
从搜索结果页面提取：
```html
<li>
  <a href="/Home/Bangumi/1824" target="_blank">
    <span data-src="/images/Bangumi/201812/5369fa4b.jpg" class="b-lazy"></span>
    <div class="an-info">
      <div class="an-text" title="剧场版 精灵宝可梦 大家的故事">...</div>
    </div>
  </a>
</li>
```

### RSS 解析目标
从 RSS XML 提取：
```xml
<item>
  <title>【字幕组】[作品名][集数][格式]</title>
  <link>https://mikan.tangbai.cc/Home/Episode/xxx</link>
  <description>【字幕组】...[4.0GB]</description>
  <enclosure url="https://mikan.tangbai.cc/Download/.../xxx.torrent"/>
  <torrent>
    <pubDate>2018-12-21T21:30:00</pubDate>
  </torrent>
</item>
```

---

## 测试要点
1. 搜索中文关键词能正确编码和返回结果
2. 海报封面图片能正确显示
3. Grid -> List 导航正常工作
4. 暂存功能在详情页正常工作
5. 磁力链复制功能正常
