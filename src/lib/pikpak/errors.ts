/** PikPak API 错误类 */

/**
 * PikPak 基础错误类
 */
export class PikPakError extends Error {
  constructor(
    message: string,
    public code?: number,
    public description?: string
  ) {
    super(message);
    this.name = "PikPakError";
    Object.setPrototypeOf(this, PikPakError.prototype);
  }
}

/**
 * PikPak 认证错误
 */
export class PikPakAuthError extends PikPakError {
  constructor(message = "Authentication failed", code?: number) {
    super(message, code);
    this.name = "PikPakAuthError";
    Object.setPrototypeOf(this, PikPakAuthError.prototype);
  }
}

/**
 * PikPak 重试错误（用于触发重试机制）
 */
export class PikPakRetryError extends PikPakError {
  constructor(message = "Request needs retry", code?: number) {
    super(message, code);
    this.name = "PikPakRetryError";
    Object.setPrototypeOf(this, PikPakRetryError.prototype);
  }
}

/**
 * PikPak 网络错误
 */
export class PikPakNetworkError extends PikPakError {
  constructor(message = "Network request failed", code?: number) {
    super(message, code);
    this.name = "PikPakNetworkError";
    Object.setPrototypeOf(this, PikPakNetworkError.prototype);
  }
}

/**
 * PikPak 配置错误
 */
export class PikPakConfigError extends PikPakError {
  constructor(message = "Configuration error", code?: number) {
    super(message, code);
    this.name = "PikPakConfigError";
    Object.setPrototypeOf(this, PikPakConfigError.prototype);
  }
}

