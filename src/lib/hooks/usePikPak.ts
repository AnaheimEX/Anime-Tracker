/** PikPak React Hook */

import { useState, useEffect, useCallback } from "react";
import { showToast, Toast } from "@raycast/api";
import { PikPakClient, PikPakAuthError } from "../pikpak";
import { getCredentials } from "../pikpak/auth";

interface UsePikPakReturn {
  client: PikPakClient | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

/**
 * PikPak 客户端 Hook
 */
export function usePikPak(): UsePikPakReturn {
  const [client, setClient] = useState<PikPakClient | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初始化客户端
  useEffect(() => {
    const initClient = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const pikpakClient = new PikPakClient();
        
        // 尝试从存储的 token 初始化
        const success = await pikpakClient.initFromStorage();
        
        if (success) {
          setClient(pikpakClient);
          setIsLoggedIn(true);
        } else {
          // Token 无效，尝试使用用户名密码登录
          const credentials = getCredentials();
          if (credentials) {
            await pikpakClient.login(credentials.username, credentials.password);
            setClient(pikpakClient);
            setIsLoggedIn(true);
          } else {
            setClient(pikpakClient);
            setIsLoggedIn(false);
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to initialize PikPak client";
        setError(errorMessage);
        console.error("Failed to initialize PikPak:", err);
      } finally {
        setIsLoading(false);
      }
    };

    initClient();
  }, []);

  // 登录
  const login = useCallback(async () => {
    if (!client) {
      throw new Error("Client not initialized");
    }

    const credentials = getCredentials();
    if (!credentials) {
      throw new Error("PikPak credentials not configured. Please set username and password in preferences.");
    }

    setIsLoading(true);
    setError(null);

    try {
      await client.login(credentials.username, credentials.password);
      setIsLoggedIn(true);
      await showToast({
        style: Toast.Style.Success,
        title: "登录成功",
        message: "已连接到 PikPak",
      });
    } catch (err) {
      let errorMessage: string;
      if (err instanceof PikPakAuthError) {
        errorMessage = "用户名或密码错误";
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = "登录失败";
      }
      
      setError(errorMessage);
      setIsLoggedIn(false);
      
      await showToast({
        style: Toast.Style.Failure,
        title: "登录失败",
        message: errorMessage,
      });
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  // 登出
  const logout = useCallback(async () => {
    if (!client) return;

    setIsLoading(true);
    try {
      await client.logout();
      setIsLoggedIn(false);
      await showToast({
        style: Toast.Style.Success,
        title: "已登出",
      });
    } catch (err) {
      console.error("Failed to logout:", err);
      await showToast({
        style: Toast.Style.Failure,
        title: "登出失败",
      });
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  return {
    client,
    isLoggedIn,
    isLoading,
    login,
    logout,
    error,
  };
}

