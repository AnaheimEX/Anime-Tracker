/** PikPak API 类型定义 */

/** 下载任务状态 */
export type DownloadPhase =
  | "PHASE_TYPE_PENDING"
  | "PHASE_TYPE_RUNNING"
  | "PHASE_TYPE_COMPLETE"
  | "PHASE_TYPE_ERROR";

/** API 响应基础结构 */
export interface PikPakResponse<T = unknown> {
  error?: string;
  error_code?: number;
  error_description?: string;
  [key: string]: unknown;
}

/** Token 数据 */
export interface TokenData {
  access_token: string;
  refresh_token: string;
  sub?: string;
  expires_in?: number;
}

/** 用户信息 */
export interface UserInfo {
  username: string | null;
  user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  encoded_token: string | null;
}

/** 离线任务 */
export interface OfflineTask {
  id: string;
  name: string;
  phase: DownloadPhase;
  progress?: number;
  file_id?: string;
  file_name?: string;
  file_size?: string;
  message?: string;
  created_time?: string;
  updated_time?: string;
  params?: {
    url?: string;
  };
}

/** 离线任务列表响应 */
export interface OfflineListResponse {
  tasks?: OfflineTask[];
  next_page_token?: string;
  expires_in?: number;
}

/** 文件类型 */
export type FileKind = "drive#file" | "drive#folder";

/** 媒体链接 */
export interface MediaLink {
  link: {
    url: string;
    token?: string;
    expire?: string;
  };
  video?: {
    width?: number;
    height?: number;
    duration?: number;
  };
}

/** 文件信息 */
export interface FileInfo {
  id: string;
  name: string;
  kind: FileKind;
  size?: string;
  created_time?: string;
  modified_time?: string;
  web_content_link?: string;
  medias?: MediaLink[];
  parent_id?: string;
  starred?: boolean;
  trashed?: boolean;
  folder_type?: string;
  mime_type?: string;
  phase?: string;
}

/** 文件列表响应 */
export interface FileListResponse {
  files?: FileInfo[];
  next_page_token?: string;
}

/** 空间配额信息 */
export interface QuotaInfo {
  kind: string;
  quota: {
    kind: string;
    limit: string;
    usage: string;
    usage_in_trash: string;
    play_times_limit?: string;
    play_times_usage?: string;
  };
  expires_at?: string;
}

/** VIP 信息 */
export interface VipInfo {
  type?: string;
  status?: string;
  expire_time?: string;
  vip_item?: unknown[];
}

/** 分享信息 */
export interface ShareInfo {
  share_id?: string;
  share_url?: string;
  pass_code?: string;
  pass_code_token?: string;
  share_status?: string;
  files?: FileInfo[];
  file_infos?: FileInfo[];
  title?: string;
  next_page_token?: string;
}

/** 分享创建响应 */
export interface ShareCreateResponse {
  share_id: string;
  share_url: string;
  pass_code?: string;
  share_text?: string;
  share_list?: unknown[];
}

/** 请求配置 */
export interface RequestConfig {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/** PikPak 客户端选项 */
export interface PikPakClientOptions {
  deviceId?: string;
  maxRetries?: number;
  initialBackoff?: number;
}

/** PikPak Preferences */
export interface PikPakPreferences {
  pikpakUsername?: string;
  pikpakPassword?: string;
}

/** 下载任务过滤选项 */
export interface OfflineListOptions {
  size?: number;
  nextPageToken?: string;
  phase?: DownloadPhase[];
}

/** 文件列表选项 */
export interface FileListOptions {
  size?: number;
  parentId?: string;
  nextPageToken?: string;
  additionalFilters?: Record<string, unknown>;
}

/** 分享文件选项 */
export interface ShareFilesOptions {
  ids: string[];
  needPassword?: boolean;
  expirationDays?: number;
}

