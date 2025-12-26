/** PikPak 认证和存储模块 */

import { LocalStorage, getPreferenceValues } from "@raycast/api";
import { TOKEN_STORAGE_KEY } from "./constants";
import { type TokenData, type PikPakPreferences } from "./types";
import { encodeToken, decodeToken } from "./utils";

/**
 * 从 LocalStorage 获取存储的 token
 */
export async function getStoredToken(): Promise<TokenData | null> {
  try {
    const encoded = await LocalStorage.getItem<string>(TOKEN_STORAGE_KEY);
    if (!encoded) return null;
    
    const decoded = decodeToken(encoded);
    return {
      access_token: decoded.access_token,
      refresh_token: decoded.refresh_token,
    };
  } catch (error) {
    console.error("Failed to get stored token:", error);
    return null;
  }
}

/**
 * 将 token 存储到 LocalStorage
 */
export async function storeToken(token: TokenData): Promise<void> {
  try {
    const encoded = encodeToken({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    });
    await LocalStorage.setItem(TOKEN_STORAGE_KEY, encoded);
  } catch (error) {
    console.error("Failed to store token:", error);
    throw error;
  }
}

/**
 * 从 LocalStorage 清除存储的 token
 */
export async function clearStoredToken(): Promise<void> {
  try {
    await LocalStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear stored token:", error);
  }
}

/**
 * 从 Preferences 获取用户凭据
 */
export function getCredentials(): { username: string; password: string } | null {
  try {
    const prefs = getPreferenceValues<PikPakPreferences>();
    
    if (!prefs.pikpakUsername || !prefs.pikpakPassword) {
      return null;
    }
    
    return {
      username: prefs.pikpakUsername,
      password: prefs.pikpakPassword,
    };
  } catch (error) {
    console.error("Failed to get credentials:", error);
    return null;
  }
}

/**
 * 检查是否配置了 PikPak 凭据
 */
export function hasCredentials(): boolean {
  return getCredentials() !== null;
}

