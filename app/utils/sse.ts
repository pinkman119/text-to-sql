import type { Response } from "express";

/**
 * 为长连接 SSE 设置响应头（禁用缓存、便于反向代理透传）。
 */
function initSseResponse(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const resWithFlush = res as Response & { flushHeaders?: () => void };
  resWithFlush.flushHeaders?.();
}

/**
 * 写入一条 SSE `data:` 帧，负载为 JSON。
 */
function writeSseJson(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * 写入一条或多条 `data:` 行（正文中的换行按 SSE 规范拆成多行），末尾空行结束该事件。
 */
function writeSseText(res: Response, text: string): void {
  if (text === "") {
    return;
  }
  for (const line of text.split("\n")) {
    res.write(`data: ${line}\n`);
  }
  res.write("\n");
}

export { initSseResponse, writeSseJson, writeSseText };
