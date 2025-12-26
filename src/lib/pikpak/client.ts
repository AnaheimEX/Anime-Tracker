/** PikPak API 客户端 */

import {
  PIKPAK_API_HOST,
  PIKPAK_USER_HOST,
  CLIENT_ID,
  CLIENT_SECRET,
  DEFAULT_MAX_RETRIES,
  DEFAULT_INITIAL_BACKOFF,
} from "./constants";
import {
  type PikPakClientOptions,
  type TokenData,
  type UserInfo,
  type OfflineTask,
  type OfflineListResponse,
  type FileInfo,
  type FileListResponse,
  type QuotaInfo,
  type VipInfo,
  type ShareInfo,
  type ShareCreateResponse,
  type PikPakResponse,
  type RequestConfig,
  type OfflineListOptions,
  type FileListOptions,
  type ShareFilesOptions,
} from "./types";
import {
  generateDeviceId,
  generateDeviceIdFromCredentials,
  buildCustomUserAgent,
  captchaSign,
  getTimestamp,
} from "./utils";
import { PikPakError, PikPakAuthError, PikPakRetryError, PikPakNetworkError } from "./errors";
import { getStoredToken, storeToken, clearStoredToken } from "./auth";

/**
 * PikPak API 客户端
 */
export class PikPakClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private userId: string | null = null;
  private deviceId: string;
  private captchaToken: string | null = null;
  private readonly maxRetries: number;
  private readonly initialBackoff: number;

  constructor(options?: PikPakClientOptions) {
    this.deviceId = options?.deviceId ?? generateDeviceId();
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialBackoff = options?.initialBackoff ?? DEFAULT_INITIAL_BACKOFF;
  }

  /**
   * 获取请求头
   */
  private getHeaders(accessToken?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": this.captchaToken
        ? buildCustomUserAgent(this.deviceId, this.userId || "")
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Content-Type": "application/json; charset=utf-8",
    };

    if (this.accessToken || accessToken) {
      headers["Authorization"] = `Bearer ${accessToken || this.accessToken}`;
    }

    if (this.captchaToken) {
      headers["X-Captcha-Token"] = this.captchaToken;
    }

    if (this.deviceId) {
      headers["X-Device-Id"] = this.deviceId;
    }

    return headers;
  }

  /**
   * 处理响应
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    let jsonData: PikPakResponse<T>;

    try {
      jsonData = await response.json();
    } catch {
      if (response.ok) {
        return {} as T;
      }
      throw new PikPakRetryError("Empty JSON data");
    }

    if (!jsonData) {
      if (response.ok) {
        return {} as T;
      }
      throw new PikPakRetryError("Empty JSON data");
    }

    if (!jsonData.error) {
      return jsonData as T;
    }

    if (jsonData.error === "invalid_account_or_password") {
      throw new PikPakAuthError("Invalid username or password");
    }

    if (jsonData.error_code === 16) {
      await this.refreshAccessToken();
      throw new PikPakRetryError("Token refreshed, please retry");
    }

    throw new PikPakError(jsonData.error_description || "Unknown Error", jsonData.error_code);
  }

  /**
   * 构建请求 URL
   */
  private buildRequestUrl(config: RequestConfig): URL {
    const url = new URL(config.url);

    if (config.params) {
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          let stringValue: string;
          if (typeof value === 'object') {
            stringValue = JSON.stringify(value);
          } else if (typeof value === 'number' || typeof value === 'boolean') {
            stringValue = String(value);
          } else {
            stringValue = value as string;
          }
          url.searchParams.append(key, stringValue);
        }
      });
    }

    return url;
  }

  /**
   * 执行单次请求
   */
  private async executeRequest<T>(config: RequestConfig): Promise<T> {
    const headers = config.headers || this.getHeaders();
    const url = this.buildRequestUrl(config);

    const response = await fetch(url.toString(), {
      method: config.method,
      headers,
      body: config.data ? JSON.stringify(config.data) : undefined,
    });

    return await this.handleResponse<T>(response);
  }

  /**
   * 处理请求错误
   */
  private async handleRequestError(error: unknown, attempt: number): Promise<boolean> {
    if (error instanceof PikPakRetryError) {
      // Token 刷新后立即重试，不等待
      if (error.message.includes("Token refreshed")) {
        return true;
      }
    } else if (error instanceof PikPakError) {
      throw error;
    }

    // 等待后重试
    if (attempt < this.maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, this.initialBackoff * 1000 * Math.pow(2, attempt)));
      return true;
    }

    return false;
  }

  /**
   * 发送请求
   */
  private async request<T>(config: RequestConfig): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(config);
      } catch (error) {
        lastError = error as Error;
        const shouldRetry = await this.handleRequestError(error, attempt);
        if (!shouldRetry) {
          break;
        }
      }
    }

    throw new PikPakNetworkError(`Max retries reached. Last error: ${lastError?.message}`);
  }

  /**
   * 初始化验证码
   */
  private async captchaInit(action: string, meta?: Record<string, unknown>): Promise<{ captcha_token?: string }> {
    const url = `https://${PIKPAK_USER_HOST}/v1/shield/captcha/init`;
    const timestamp = getTimestamp();

    const defaultMeta = {
      captcha_sign: captchaSign(this.deviceId, timestamp),
      client_version: "1.47.1",
      package_name: "com.pikcloud.pikpak",
      user_id: this.userId || "",
      timestamp,
    };

    const params = {
      client_id: CLIENT_ID,
      action,
      device_id: this.deviceId,
      meta: meta || defaultMeta,
    };

    return await this.request<{ captcha_token?: string }>({
      method: "POST",
      url,
      data: params,
    });
  }

  /**
   * 登录
   */
  async login(username: string, password: string): Promise<void> {
    const loginUrl = `https://${PIKPAK_USER_HOST}/v1/auth/signin`;
    
    // 根据凭据生成固定的 deviceId
    this.deviceId = generateDeviceIdFromCredentials(username, password);

    const metas: Record<string, string> = {};
    if (/\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*/.test(username)) {
      metas.email = username;
    } else if (/\d{11,18}/.test(username)) {
      metas.phone_number = username;
    } else {
      metas.username = username;
    }

    const result = await this.captchaInit(`POST:${loginUrl}`, metas);
    const captchaToken = result.captcha_token;

    if (!captchaToken) {
      throw new PikPakAuthError("Failed to get captcha token");
    }

    const loginData = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      password,
      username,
      captcha_token: captchaToken,
    };

    const userInfo = await this.request<TokenData>({
      method: "POST",
      url: loginUrl,
      data: loginData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    this.accessToken = userInfo.access_token;
    this.refreshToken = userInfo.refresh_token;
    this.userId = userInfo.sub || null;

    // 存储 token
    await storeToken({
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
    });
  }

  /**
   * 刷新 access token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new PikPakAuthError("No refresh token available");
    }

    const refreshUrl = `https://${PIKPAK_USER_HOST}/v1/auth/token`;
    const refreshData = {
      client_id: CLIENT_ID,
      refresh_token: this.refreshToken,
      grant_type: "refresh_token",
    };

    const userInfo = await this.request<TokenData>({
      method: "POST",
      url: refreshUrl,
      data: refreshData,
    });

    this.accessToken = userInfo.access_token;
    this.refreshToken = userInfo.refresh_token;
    this.userId = userInfo.sub || null;

    // 更新存储的 token
    await storeToken({
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
    });
  }

  /**
   * 从存储的 token 初始化客户端
   */
  async initFromStorage(): Promise<boolean> {
    const token = await getStoredToken();
    if (!token) {
      return false;
    }

    this.accessToken = token.access_token;
    this.refreshToken = token.refresh_token;

    try {
      await this.refreshAccessToken();
      return true;
    } catch {
      await clearStoredToken();
      return false;
    }
  }

  /**
   * 登出
   */
  async logout(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.userId = null;
    await clearStoredToken();
  }

  /**
   * 获取用户信息
   */
  getUserInfo(): UserInfo {
    return {
      username: null,
      user_id: this.userId,
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      encoded_token: null,
    };
  }

  /**
   * 添加离线下载任务
   */
  async addOfflineTask(fileUrl: string, parentId?: string, name?: string): Promise<FileInfo> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/files`;
    const data = {
      kind: "drive#file",
      name,
      upload_type: "UPLOAD_TYPE_URL",
      url: { url: fileUrl },
      folder_type: parentId ? "" : "DOWNLOAD",
      parent_id: parentId,
    };

    return await this.request<FileInfo>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 获取离线任务列表
   */
  async getOfflineTasks(options?: OfflineListOptions): Promise<OfflineListResponse> {
    const size = options?.size ?? 10000;
    const nextPageToken = options?.nextPageToken;
    const phase = options?.phase ?? ["PHASE_TYPE_RUNNING", "PHASE_TYPE_ERROR"];

    const url = `https://${PIKPAK_API_HOST}/drive/v1/tasks`;
    const params = {
      type: "offline",
      thumbnail_size: "SIZE_SMALL",
      limit: size,
      page_token: nextPageToken,
      filters: JSON.stringify({ phase: { in: phase.join(",") } }),
      with: "reference_resource",
    };

    return await this.request<OfflineListResponse>({
      method: "GET",
      url,
      params,
    });
  }

  /**
   * 删除任务
   */
  async deleteTasks(taskIds: string[], deleteFiles = false): Promise<void> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/tasks`;
    const params = {
      task_ids: taskIds,
      delete_files: deleteFiles,
    };

    await this.request<void>({
      method: "DELETE",
      url,
      params,
    });
  }

  /**
   * 重试任务
   */
  async retryTask(taskId: string): Promise<OfflineTask> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/task`;
    const data = {
      type: "offline",
      create_type: "RETRY",
      id: taskId,
    };

    return await this.request<OfflineTask>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 获取文件下载链接
   */
  async getDownloadUrl(fileId: string): Promise<FileInfo> {
    const result = await this.captchaInit(`GET:/drive/v1/files/${fileId}`);
    this.captchaToken = result.captcha_token || null;

    const url = `https://${PIKPAK_API_HOST}/drive/v1/files/${fileId}`;
    const fileInfo = await this.request<FileInfo>({
      method: "GET",
      url,
    });

    this.captchaToken = null;
    return fileInfo;
  }

  /**
   * 获取文件列表
   */
  async listFiles(options?: FileListOptions): Promise<FileListResponse> {
    const size = options?.size ?? 100;
    const parentId = options?.parentId;
    const nextPageToken = options?.nextPageToken;
    const additionalFilters = options?.additionalFilters;

    const defaultFilters = {
      trashed: { eq: false },
      phase: { eq: "PHASE_TYPE_COMPLETE" },
    };

    const filters = additionalFilters ? { ...defaultFilters, ...additionalFilters } : defaultFilters;

    const url = `https://${PIKPAK_API_HOST}/drive/v1/files`;
    const params = {
      parent_id: parentId,
      thumbnail_size: "SIZE_MEDIUM",
      limit: size,
      with_audit: "true",
      page_token: nextPageToken,
      filters: JSON.stringify(filters),
    };

    return await this.request<FileListResponse>({
      method: "GET",
      url,
      params,
    });
  }

  /**
   * 创建文件夹
   */
  async createFolder(name = "新建文件夹", parentId?: string): Promise<{ file: FileInfo }> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/files`;
    const data = {
      kind: "drive#folder",
      name,
      parent_id: parentId,
    };

    return await this.request<{ file: FileInfo }>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 移动文件到回收站
   */
  async trashFiles(ids: string[]): Promise<Record<string, unknown>> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/files:batchTrash`;
    const data = { ids };

    return await this.request<Record<string, unknown>>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 从回收站恢复文件
   */
  async untrashFiles(ids: string[]): Promise<Record<string, unknown>> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/files:batchUntrash`;
    const data = { ids };

    return await this.request<Record<string, unknown>>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 永久删除文件
   */
  async deleteFiles(ids: string[]): Promise<Record<string, unknown>> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/files:batchDelete`;
    const data = { ids };

    return await this.request<Record<string, unknown>>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 重命名文件
   */
  async renameFile(id: string, newFileName: string): Promise<FileInfo> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/files/${id}`;
    const data = { name: newFileName };

    return await this.request<FileInfo>({
      method: "PATCH",
      url,
      data,
    });
  }

  /**
   * 批量移动文件
   */
  async moveFiles(ids: string[], toParentId?: string): Promise<Record<string, unknown>> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/files:batchMove`;
    const data = {
      ids,
      to: toParentId ? { parent_id: toParentId } : {},
    };

    return await this.request<Record<string, unknown>>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 批量复制文件
   */
  async copyFiles(ids: string[], toParentId?: string): Promise<Record<string, unknown>> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/files:batchCopy`;
    const data = {
      ids,
      to: toParentId ? { parent_id: toParentId } : {},
    };

    return await this.request<Record<string, unknown>>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 批量分享文件
   */
  async shareFiles(options: ShareFilesOptions): Promise<ShareCreateResponse> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/share`;
    const data = {
      file_ids: options.ids,
      share_to: options.needPassword ? "encryptedlink" : "publiclink",
      expiration_days: options.expirationDays ?? -1,
      pass_code_option: options.needPassword ? "REQUIRED" : "NOT_REQUIRED",
    };

    return await this.request<ShareCreateResponse>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 获取分享信息
   */
  async getShareInfo(shareLink: string, passCode?: string): Promise<ShareInfo> {
    const match = /\/s\/([^/]+)(?:.*\/([^/]+))?$/.exec(shareLink);
    if (!match) {
      throw new PikPakError("Invalid share link");
    }

    const shareId = match[1];
    const parentId = match[2] || undefined;

    const url = `https://${PIKPAK_API_HOST}/drive/v1/share`;
    const params = {
      limit: "100",
      thumbnail_size: "SIZE_LARGE",
      order: "3",
      share_id: shareId,
      parent_id: parentId,
      pass_code: passCode,
    };

    return await this.request<ShareInfo>({
      method: "GET",
      url,
      params,
    });
  }

  /**
   * 转存分享文件
   */
  async saveFromShare(shareId: string, passCodeToken: string, fileIds: string[]): Promise<Record<string, unknown>> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/share/restore`;
    const data = {
      share_id: shareId,
      pass_code_token: passCodeToken,
      file_ids: fileIds,
    };

    return await this.request<Record<string, unknown>>({
      method: "POST",
      url,
      data,
    });
  }

  /**
   * 获取空间配额信息
   */
  async getQuota(): Promise<QuotaInfo> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/about`;
    return await this.request<QuotaInfo>({
      method: "GET",
      url,
    });
  }

  /**
   * 获取 VIP 信息
   */
  async getVipInfo(): Promise<VipInfo> {
    const url = `https://${PIKPAK_API_HOST}/drive/v1/privilege/vip`;
    return await this.request<VipInfo>({
      method: "GET",
      url,
    });
  }

  /**
   * 检查是否已登录
   */
  isLoggedIn(): boolean {
    return this.accessToken !== null && this.refreshToken !== null;
  }
}

