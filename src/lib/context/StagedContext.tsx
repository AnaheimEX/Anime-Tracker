import { createContext, useContext } from "react";

interface StagedContextValue {
  stagedCount: number;
  onCopyAll: () => Promise<void>;
}

/**
 * 暂存上下文
 * 用于在组件之间共享暂存数量和批量复制功能
 */
export const StagedContext = createContext<StagedContextValue | null>(null);

/**
 * 使用暂存上下文的 Hook
 * @throws 如果在 StagedContext.Provider 外部使用
 */
export function useStagedContext(): StagedContextValue {
  const context = useContext(StagedContext);
  if (!context) {
    throw new Error("useStagedContext must be used within a StagedContext.Provider");
  }
  return context;
}
