import { ActionPanel, Action, Icon } from "@raycast/api";
import { useStagedContext } from "../lib";

/** 磁力链操作处理器 */
interface ActionHandlers {
  onBrowserPikpak: () => void;
  onDownload: () => void;
  onCopy: () => void;
}

/** 暂存状态与处理器 */
interface StagingState {
  onStage?: () => void;
  onUnstage?: () => void;
  isStaged: boolean;
}

interface AnimeActionsProps {
  actions: ActionHandlers;
  staging: StagingState;
}

/**
 * 共享的动漫操作面板组件
 * 提供统一的操作按钮布局
 */
export function AnimeActions({ actions, staging }: Readonly<AnimeActionsProps>) {
  const { stagedCount, onCopyAll } = useStagedContext();

  return (
    <ActionPanel>
      {staging.isStaged ? (
        // 暂存项目的操作
        <>
          <ActionPanel.Section title="暂存操作">
            <Action
              title={stagedCount > 0 ? `复制全部 ${stagedCount} 个磁力链` : "复制全部磁力链"}
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              onAction={onCopyAll}
            />
            {staging.onUnstage && (
              <Action
                title="从暂存移除"
                icon={Icon.Minus}
                shortcut={{ modifiers: ["cmd"], key: "d" }}
                onAction={staging.onUnstage}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section title="单项操作">
            <Action title="Chrome / PikPak 播放" icon={Icon.Globe} onAction={actions.onBrowserPikpak} />
            <Action title="本地下载" icon={Icon.Download} onAction={actions.onDownload} />
            <Action title="复制磁力链" icon={Icon.Clipboard} onAction={actions.onCopy} />
          </ActionPanel.Section>
        </>
      ) : (
        // 普通项目的操作
        <>
          <ActionPanel.Section title="推荐操作">
            <Action title="Chrome / PikPak 播放" icon={Icon.Globe} onAction={actions.onBrowserPikpak} />
            {staging.onStage && (
              <Action
                title="加入暂存"
                icon={Icon.Plus}
                shortcut={{ modifiers: ["cmd"], key: "s" }}
                onAction={staging.onStage}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section title="其他">
            <Action title="本地下载" icon={Icon.Download} onAction={actions.onDownload} />
            <Action title="复制磁力链" icon={Icon.Clipboard} onAction={actions.onCopy} />
          </ActionPanel.Section>
          <ActionPanel.Section title="暂存">
            <Action
              title={stagedCount > 0 ? `复制全部 ${stagedCount} 个磁力链` : "复制全部磁力链"}
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              onAction={onCopyAll}
            />
          </ActionPanel.Section>
        </>
      )}
    </ActionPanel>
  );
}
