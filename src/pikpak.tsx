import React, { useState, useEffect, useCallback } from "react";
import { List, ActionPanel, Action, showToast, Toast, Icon, Color, open, Clipboard } from "@raycast/api";
import { usePikPak } from "./lib/hooks";
import { type OfflineTask, hasCredentials } from "./lib/pikpak";

/**
 * PikPak 任务管理命令
 */
export default function PikPakCommand() {
  const { client, isLoggedIn, isLoading: clientLoading, login } = usePikPak();
  const [tasks, setTasks] = useState<OfflineTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 检查是否配置了凭据
  const hasConfig = hasCredentials();

  // 加载任务列表
  const loadTasks = useCallback(async () => {
    if (!client || !isLoggedIn) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await client.getOfflineTasks({
        phase: ["PHASE_TYPE_RUNNING", "PHASE_TYPE_ERROR", "PHASE_TYPE_COMPLETE"],
      });
      setTasks(result.tasks || []);
    } catch (error) {
      console.error("Failed to load tasks:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "加载任务失败",
        message: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setIsLoading(false);
    }
  }, [client, isLoggedIn]);

  // 初始化和自动登录
  useEffect(() => {
    const init = async () => {
      if (clientLoading) return;

      if (!isLoggedIn && hasConfig) {
        try {
          await login();
        } catch (error) {
          console.error("Auto login failed:", error);
        }
      }
    };

    init();
  }, [clientLoading, isLoggedIn, hasConfig, login]);

  // 加载任务
  useEffect(() => {
    if (isLoggedIn && !clientLoading) {
      loadTasks();
    }
  }, [isLoggedIn, clientLoading, loadTasks]);

  // 删除任务
  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (!client) return;

      try {
        await showToast({ style: Toast.Style.Animated, title: "删除中..." });
        await client.deleteTasks([taskId], false);
        await showToast({ style: Toast.Style.Success, title: "已删除任务" });
        await loadTasks();
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "删除失败",
          message: error instanceof Error ? error.message : "未知错误",
        });
      }
    },
    [client, loadTasks]
  );

  // 重试任务
  const handleRetryTask = useCallback(
    async (taskId: string) => {
      if (!client) return;

      try {
        await showToast({ style: Toast.Style.Animated, title: "重试中..." });
        await client.retryTask(taskId);
        await showToast({ style: Toast.Style.Success, title: "已重新开始任务" });
        await loadTasks();
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "重试失败",
          message: error instanceof Error ? error.message : "未知错误",
        });
      }
    },
    [client, loadTasks]
  );

  // 获取下载链接
  const handleGetDownloadUrl = useCallback(
    async (fileId: string) => {
      if (!client) return;

      try {
        await showToast({ style: Toast.Style.Animated, title: "获取链接中..." });
        const fileInfo = await client.getDownloadUrl(fileId);

        const downloadUrl = fileInfo.web_content_link || fileInfo.medias?.[0]?.link?.url;

        if (downloadUrl) {
          await Clipboard.copy(downloadUrl);
          await showToast({
            style: Toast.Style.Success,
            title: "已复制下载链接",
            message: "链接已复制到剪贴板",
          });
        } else {
          await showToast({
            style: Toast.Style.Failure,
            title: "未找到下载链接",
          });
        }
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "获取链接失败",
          message: error instanceof Error ? error.message : "未知错误",
        });
      }
    },
    [client]
  );

  // 使用 IINA 播放
  const handlePlayWithIINA = useCallback(
    async (fileId: string) => {
      if (!client) return;

      try {
        await showToast({ style: Toast.Style.Animated, title: "获取播放链接..." });
        const fileInfo = await client.getDownloadUrl(fileId);

        const downloadUrl = fileInfo.web_content_link || fileInfo.medias?.[0]?.link?.url;

        if (downloadUrl) {
          await showToast({ style: Toast.Style.Animated, title: "启动 IINA..." });

          // 使用 IINA 的 URL scheme 打开，这是更可靠的方式
          const iinaUrl = `iina://weblink?url=${encodeURIComponent(downloadUrl)}`;
          await open(iinaUrl);

          await showToast({
            style: Toast.Style.Success,
            title: "已启动 IINA 播放",
          });
        } else {
          await showToast({
            style: Toast.Style.Failure,
            title: "未找到播放链接",
          });
        }
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "播放失败",
          message: error instanceof Error ? error.message : "未知错误",
        });
      }
    },
    [client]
  );

  // 打开 PikPak 网页
  const handleOpenPikPak = useCallback(async () => {
    await open("https://mypikpak.com");
  }, []);

  // 未配置凭据
  if (!hasConfig) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="未配置 PikPak 账号"
          description="请在插件设置中配置 PikPak 用户名和密码"
        />
      </List>
    );
  }

  // 未登录
  if (!isLoggedIn && !clientLoading) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="未登录 PikPak"
          description="请检查用户名和密码是否正确"
          actions={
            <ActionPanel>
              <Action title="重新登录" icon={Icon.ArrowClockwise} onAction={login} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading || clientLoading}
      searchBarPlaceholder="搜索任务..."
    >
      {tasks.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Download}
          title="暂无离线任务"
          description="添加磁力链或 URL 开始下载"
          actions={
            <ActionPanel>
              <Action title="打开 PikPak 网页" icon={Icon.Globe} onAction={handleOpenPikPak} />
              <Action title="刷新列表" icon={Icon.ArrowClockwise} onAction={loadTasks} />
            </ActionPanel>
          }
        />
      ) : (
        <>
          <List.Section title="运行中" subtitle={`${tasks.filter((t) => t.phase === "PHASE_TYPE_RUNNING").length} 个`}>
            {tasks
              .filter((task) => task.phase === "PHASE_TYPE_RUNNING")
              .map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  onDelete={handleDeleteTask}
                  onRetry={handleRetryTask}
                  onGetDownloadUrl={handleGetDownloadUrl}
                  onPlayWithIINA={handlePlayWithIINA}
                  onRefresh={loadTasks}
                />
              ))}
          </List.Section>

          <List.Section title="已完成" subtitle={`${tasks.filter((t) => t.phase === "PHASE_TYPE_COMPLETE").length} 个`}>
            {tasks
              .filter((task) => task.phase === "PHASE_TYPE_COMPLETE")
              .map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  onDelete={handleDeleteTask}
                  onRetry={handleRetryTask}
                  onGetDownloadUrl={handleGetDownloadUrl}
                  onPlayWithIINA={handlePlayWithIINA}
                  onRefresh={loadTasks}
                />
              ))}
          </List.Section>

          <List.Section title="错误" subtitle={`${tasks.filter((t) => t.phase === "PHASE_TYPE_ERROR").length} 个`}>
            {tasks
              .filter((task) => task.phase === "PHASE_TYPE_ERROR")
              .map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  onDelete={handleDeleteTask}
                  onRetry={handleRetryTask}
                  onGetDownloadUrl={handleGetDownloadUrl}
                  onPlayWithIINA={handlePlayWithIINA}
                  onRefresh={loadTasks}
                />
              ))}
          </List.Section>
        </>
      )}
    </List>
  );
}

interface TaskListItemProps {
  task: OfflineTask;
  onDelete: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onGetDownloadUrl: (fileId: string) => void;
  onPlayWithIINA: (fileId: string) => void;
  onRefresh: () => void;
}

interface CompleteTaskActionsProps {
  fileId: string;
  onGetDownloadUrl: (fileId: string) => void;
  onPlayWithIINA: (fileId: string) => void;
}

function CompleteTaskActions({ fileId, onGetDownloadUrl, onPlayWithIINA }: Readonly<CompleteTaskActionsProps>) {
  return (
    <>
      <Action
        title="使用 IINA 播放"
        icon={Icon.Play}
        onAction={() => onPlayWithIINA(fileId)}
      />
      <Action
        title="获取下载链接"
        icon={Icon.Link}
        shortcut={{ modifiers: ["cmd"], key: "l" }}
        onAction={() => onGetDownloadUrl(fileId)}
      />
    </>
  );
}

function TaskListItem({ task, onDelete, onRetry, onGetDownloadUrl, onPlayWithIINA, onRefresh }: Readonly<TaskListItemProps>) {
  const getStatusIcon = () => {
    switch (task.phase) {
      case "PHASE_TYPE_RUNNING":
        return { source: Icon.Download, tintColor: Color.Blue };
      case "PHASE_TYPE_COMPLETE":
        return { source: Icon.CheckCircle, tintColor: Color.Green };
      case "PHASE_TYPE_ERROR":
        return { source: Icon.XMarkCircle, tintColor: Color.Red };
      default:
        return { source: Icon.Circle, tintColor: Color.SecondaryText };
    }
  };

  const getStatusText = () => {
    switch (task.phase) {
      case "PHASE_TYPE_RUNNING":
        return "下载中";
      case "PHASE_TYPE_COMPLETE":
        return "已完成";
      case "PHASE_TYPE_ERROR":
        return "错误";
      case "PHASE_TYPE_PENDING":
        return "等待中";
      default:
        return "未知";
    }
  };

  const accessories: List.Item.Accessory[] = [
    { text: getStatusText() },
  ];

  if (task.file_size) {
    accessories.unshift({ text: task.file_size });
  }

  return (
    <List.Item
      id={task.id}
      title={task.name}
      subtitle={task.message}
      icon={getStatusIcon()}
      accessories={accessories}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="任务操作">
            {task.phase === "PHASE_TYPE_COMPLETE" && task.file_id && (
              <CompleteTaskActions
                fileId={task.file_id}
                onGetDownloadUrl={onGetDownloadUrl}
                onPlayWithIINA={onPlayWithIINA}
              />
            )}
            {task.phase === "PHASE_TYPE_ERROR" && (
              <Action
                title="重试任务"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={() => onRetry(task.id)}
              />
            )}
            <Action
              title="删除任务"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd"], key: "d" }}
              onAction={() => onDelete(task.id)}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="其他">
            <Action
              title="刷新列表"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={onRefresh}
            />
            <Action
              title="打开 PikPak 网页"
              icon={Icon.Globe}
              onAction={async () => await open("https://mypikpak.com")}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

