/**
 兼容旧导入路径的 bridge auth 导出。

 目录分层后，真实实现位于 bridge/auth.ts；
 这里暂时保留旧文件名，避免一次性打散所有引用。
 */
export * from "./bridge/auth.js";
