import { formatDate } from "../lib/utils";

interface DetailMarkdownParams {
  coverUrl?: string;
  animeName: string;
  pubDate: string;
  fileSize?: string;
  title: string;
}

/**
 * 构建详情面板的 Markdown 内容
 */
export function buildDetailMarkdown({
  coverUrl,
  animeName,
  pubDate,
  fileSize,
  title,
}: DetailMarkdownParams): string {
  const imageMarkdown = coverUrl ? `![封面](${coverUrl})` : "";
  const fileSizeMarkdown = fileSize ? `**文件大小**: ${fileSize}` : "";

  return `
${imageMarkdown}

# ${animeName}

**更新时间**: ${formatDate(pubDate)}

${fileSizeMarkdown}

---
**原始文件**: ${title}
  `.trim();
}
