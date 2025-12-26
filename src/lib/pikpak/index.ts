/** PikPak API 统一导出 */

// 客户端
export { PikPakClient } from "./client";

// 类型
export type {
  DownloadPhase,
  PikPakResponse,
  TokenData,
  UserInfo,
  OfflineTask,
  OfflineListResponse,
  FileKind,
  MediaLink,
  FileInfo,
  FileListResponse,
  QuotaInfo,
  VipInfo,
  ShareInfo,
  ShareCreateResponse,
  RequestConfig,
  PikPakClientOptions,
  PikPakPreferences,
  OfflineListOptions,
  FileListOptions,
  ShareFilesOptions,
} from "./types";

// 错误类
export { PikPakError, PikPakAuthError, PikPakRetryError, PikPakNetworkError, PikPakConfigError } from "./errors";

// 工具函数
export {
  getTimestamp,
  generateDeviceId,
  captchaSign,
  generateDeviceSign,
  buildCustomUserAgent,
  encodeToken,
  decodeToken,
  generateDeviceIdFromCredentials,
} from "./utils";

// 认证函数
export { getStoredToken, storeToken, clearStoredToken, getCredentials, hasCredentials } from "./auth";

// 常量
export {
  PIKPAK_API_HOST,
  PIKPAK_USER_HOST,
  CLIENT_ID,
  CLIENT_SECRET,
  CLIENT_VERSION,
  PACKAGE_NAME,
  TOKEN_STORAGE_KEY,
} from "./constants";

