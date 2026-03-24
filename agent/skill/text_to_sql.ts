import { BaseMessage } from "@langchain/core/messages";
import { createAgent, HumanMessage } from "langchain";
import {
  TEXT_TO_SQL_AGENT_CONTEXT_CONFIG_KEY,
  textToSqlAgentContextFromQuery,
  textToSqlAgentContextSchema,
  type TextToSqlAgentContext,
} from "../context/text_to_sql_agent_context";
import { createDeepSeekLLM } from "../llm/deepseek";
import { getTextToSqlPrompt } from "../prompt/text_to_sql";
import { tools } from "../tool/text_to_sql_tool";

function buildTextToSqlAgent() {
  return createAgent({
    model: createDeepSeekLLM(),
    tools,
    systemPrompt: getTextToSqlPrompt(),
    contextSchema: textToSqlAgentContextSchema,
  });
}

/**
 * 组装本次调用的 `RunnableConfig`：`context` + 在 `configurable` 中镜像一份，便于工具侧稳定读取。
 */
function buildAgentInvokeOptions(context: TextToSqlAgentContext): {
  context: TextToSqlAgentContext;
  configurable: Record<string, unknown>;
} {
  return {
    context,
    configurable: {
      [TEXT_TO_SQL_AGENT_CONTEXT_CONFIG_KEY]: context,
    },
  };
}

/**
 * 从一条 Message 中取出可展示的纯文本（忽略结构化块中的非 text 部分）。
 */
function messageToPlainText(msg: BaseMessage): string {
  const c = msg.content;
  if (typeof c === "string") {
    return c;
  }
  if (Array.isArray(c)) {
    return c
      .map((block) => {
        if (typeof block === "string") {
          return block;
        }
        if (
          block &&
          typeof block === "object" &&
          "type" in block &&
          (block as { type: string }).type === "text"
        ) {
          const t = (block as { text?: string }).text;
          return t != null ? String(t) : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

/**
 * 使用用户自然语言 `message` 调用绑定 DeepSeek 与 Text-to-SQL 工具链的 Agent，并返回最终状态。
 *
 * **自定义 context（与 `contextSchema` 对应的是「值」）**
 *
 * 1. **传入**：第二参数传入 `{ context: { ... } }`，字段需符合 {@link textToSqlAgentContextSchema}（如 `userId`、`requestId`、`locale`）。
 * 2. **在工具里取出**：在 `Tool._call` 第三参 `parentConfig` 上使用
 *    `getAgentRuntimeStateFromToolConfig(parentConfig).context`（见 `agent/tool/text_to_sql_tool.ts`），
 *    内部会依次尝试：`context`、`config.context`、`configurable` 中的镜像键（见 {@link TEXT_TO_SQL_AGENT_CONTEXT_CONFIG_KEY}）、`getConfig()` 等。
 *
 * @example
 * ```ts
 * await createTextToSqlAgent("有哪些表", {
 *   context: { userId: "u1", requestId: "req-1", locale: "zh-CN" },
 * });
 * ```
 *
 * @param options.context - 可选；未传则工具侧 `context` 为 `undefined`（HTTP 层可用 {@link textToSqlAgentContextFromQuery} 从 query 组装）
 */
async function createTextToSqlAgent(
  message: string,
  options?: { context?: TextToSqlAgentContext },
) {
  const agent = buildTextToSqlAgent();
  return await agent.invoke(
    { messages: [new HumanMessage(message)] },
    options?.context != null ? buildAgentInvokeOptions(options.context) : {},
  );
}

/**
 * 流式输出中仅产出纯文本片段：来自模型与工具的可见文本，不重复用户输入，不含 JSON 包装。
 *
 * @param message - 用户自然语言问题
 * @param options.signal - 客户端断开时可中止底层图执行
 * @param options.context - 可选；本次调用的运行时上下文（与 invoke 一致）
 */
async function* streamTextToSqlAgent(
  message: string,
  options?: { signal?: AbortSignal; context?: TextToSqlAgentContext },
): AsyncGenerator<string, void, undefined> {
  const agent = buildTextToSqlAgent();
  const stream = await agent.stream(
    { messages: [new HumanMessage(message)] },
    {
      streamMode: "messages",
      signal: options?.signal,
      ...(options?.context != null ? buildAgentInvokeOptions(options.context) : {}),
    },
  );

  for await (const chunk of stream) {
    if (!Array.isArray(chunk) || chunk.length !== 2) {
      continue;
    }
    const [msg, _meta] = chunk as [BaseMessage, Record<string, unknown>];
    if (msg.type === "human") {
      continue;
    }
    const text = messageToPlainText(msg);
    if (text === "") {
      continue;
    }
    yield text;
  }
}

export type { TextToSqlAgentContext };
export {
  TEXT_TO_SQL_AGENT_CONTEXT_CONFIG_KEY,
  createTextToSqlAgent,
  streamTextToSqlAgent,
  textToSqlAgentContextFromQuery,
  textToSqlAgentContextSchema,
};
