/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** PikPak 用户名 - PikPak 账号（邮箱或手机号） */
  "pikpakUsername"?: string,
  /** PikPak 密码 - PikPak 账号密码 */
  "pikpakPassword"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `index` command */
  export type Index = ExtensionPreferences & {}
  /** Preferences accessible in the `anime-search` command */
  export type AnimeSearch = ExtensionPreferences & {}
  /** Preferences accessible in the `pikpak` command */
  export type Pikpak = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `index` command */
  export type Index = {}
  /** Arguments passed to the `anime-search` command */
  export type AnimeSearch = {}
  /** Arguments passed to the `pikpak` command */
  export type Pikpak = {}
}

