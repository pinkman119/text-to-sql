import { z } from "zod";

/**
 * 同步写入 `invoke` / `stream` 的 `configurable`，供工具在 `RunnableConfig.context` 未传到 Tool 节点时仍能读取。
 * LangGraph 对 `RunnableConfig.context` 的传递链路在部分版本/节点下不保证到达 `tool.invoke` 第二参；`configurable` 会随任务合并传递。
 */
const TEXT_TO_SQL_AGENT_CONTEXT_CONFIG_KEY = "__text_to_sql_agent_context__";

/**
 * Text-to-SQL Agent 的**运行时上下文**（`createAgent({ contextSchema })`），单次调用有效、默认不落库。
 * 在 `agent.invoke` / `agent.stream` 第二参数传入 `{ context: { ... } }`，工具内可通过 `getAgentRuntimeStateFromToolConfig(parentConfig).context` 读取。
 */
const textToSqlAgentContextSchema = z.object({
  /** 可选：业务用户标识 */
  userId: z.string().optional(),
  /** 可选：请求追踪 ID */
  requestId: z.string().optional(),
  /** 可选：区域/语言偏好，如 zh-CN */
  locale: z.string().optional(),
});

type TextToSqlAgentContext = z.infer<typeof textToSqlAgentContextSchema>;

/**
 * 从 HTTP query（如 `?userId=1&requestId=abc`）组装本次 Agent 的 `context`。
 * 若三个字段均未提供有效字符串，返回 `undefined`（与「未传 context」一致）。
 */
function textToSqlAgentContextFromQuery(query: Record<string, unknown>): TextToSqlAgentContext | undefined {
  const pick = (keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = query[k];
      if (v == null) {
        continue;
      }
      const s = String(v).trim();
      if (s !== "") {
        return s;
      }
    }
    return undefined;
  };
  const userId = pick(["userId", "user_id"]);
  const requestId = pick(["requestId", "request_id"]);
  const locale = pick(["locale"]);
  if (userId == null && requestId == null && locale == null) {
    return undefined;
  }
  const parsed = textToSqlAgentContextSchema.safeParse({ userId, requestId, locale });
  return parsed.success ? parsed.data : undefined;
}

export type { TextToSqlAgentContext };
export {
  TEXT_TO_SQL_AGENT_CONTEXT_CONFIG_KEY,
  textToSqlAgentContextSchema,
  textToSqlAgentContextFromQuery,
};

