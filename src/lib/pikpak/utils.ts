/** PikPak API 工具函数 */

import { createHash, randomUUID } from "node:crypto";
import {
  CLIENT_ID,
  CLIENT_VERSION,
  PACKAGE_NAME,
  SALTS,
  SDK_VERSION,
  APP_NAME,
} from "./constants";

/**
 * 获取当前时间戳（毫秒）
 */
export function getTimestamp(): string {
  return Date.now().toString();
}

/**
 * 生成随机设备 ID（32位十六进制字符串）
 */
export function generateDeviceId(): string {
  return randomUUID().replaceAll("-", "");
}

/**
 * 计算验证码签名
 * 使用链式 MD5 哈希计算
 */
export function captchaSign(deviceId: string, timestamp: string): string {
  let sign = CLIENT_ID + CLIENT_VERSION + PACKAGE_NAME + deviceId + timestamp;
  
  for (const salt of SALTS) {
    sign = createHash("md5")
      .update(sign + salt)
      .digest("hex");
  }
  
  return `1.${sign}`;
}

/**
 * 生成设备签名
 */
export function generateDeviceSign(deviceId: string, packageName: string): string {
  const signatureBase = `${deviceId}${packageName}1appkey`;
  
  // 计算 SHA-1 哈希
  const sha1Hash = createHash("sha1")
    .update(signatureBase, "utf-8")
    .digest("hex");
  
  // 计算 MD5 哈希
  const md5Hash = createHash("md5")
    .update(sha1Hash, "utf-8")
    .digest("hex");
  
  return `div101.${deviceId}${md5Hash}`;
}

/**
 * 构建自定义 User-Agent
 */
export function buildCustomUserAgent(deviceId: string, userId: string): string {
  const deviceSign = generateDeviceSign(deviceId, PACKAGE_NAME);
  
  const userAgentParts = [
    `ANDROID-${APP_NAME}/${CLIENT_VERSION}`,
    "protocolVersion/200",
    "accesstype/",
    `clientid/${CLIENT_ID}`,
    `clientversion/${CLIENT_VERSION}`,
    "action_type/",
    "networktype/WIFI",
    "sessionid/",
    `deviceid/${deviceId}`,
    "providername/NONE",
    `devicesign/${deviceSign}`,
    "refresh_token/",
    `sdkversion/${SDK_VERSION}`,
    `datetime/${getTimestamp()}`,
    `usrno/${userId}`,
    `appname/${APP_NAME}`,
    "session_origin/",
    "grant_type/",
    "appid/",
    "clientip/",
    "devicename/Xiaomi_M2004j7ac",
    "osversion/13",
    "platformversion/10",
    "accessmode/",
    "devicemodel/M2004J7AC",
  ];
  
  return userAgentParts.join(" ");
}

/**
 * 编码 token 为 Base64
 */
export function encodeToken(data: { access_token: string; refresh_token: string }): string {
  return Buffer.from(
    JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
  ).toString("base64");
}

/**
 * 解码 Base64 token
 */
export function decodeToken(encoded: string): { access_token: string; refresh_token: string } {
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
}

/**
 * 生成基于用户名和密码的设备 ID
 */
export function generateDeviceIdFromCredentials(username: string, password: string): string {
  return createHash("md5")
    .update(`${username}${password}`)
    .digest("hex");
}

