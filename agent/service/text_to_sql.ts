import { BaseMessage } from "@langchain/core/messages";
import { createAgent, HumanMessage } from "langchain";
import { createDeepSeekLLM } from "../llm/deepseek";
import { getTextToSqlPrompt } from "../prompt/text_to_sql";
import { tools } from "../tool/text_to_sql_tool";

function buildTextToSqlAgent() {
  return createAgent({
    model: createDeepSeekLLM(),
    tools,
    systemPrompt: getTextToSqlPrompt(),
  });
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
        if (block && typeof block === "object" && "type" in block && (block as { type: string }).type === "text") {
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
 */
async function createTextToSqlAgent(message: string) {
  const agent = buildTextToSqlAgent();
  return await agent.invoke({
    messages: [new HumanMessage(message)],
  });
}

/**
 * 流式输出中仅产出纯文本片段：来自模型与工具的可见文本，不重复用户输入，不含 JSON 包装。
 *
 * @param message - 用户自然语言问题
 * @param options.signal - 客户端断开时可中止底层图执行
 */
async function* streamTextToSqlAgent(
  message: string,
  options?: { signal?: AbortSignal },
): AsyncGenerator<string, void, undefined> {
  const agent = buildTextToSqlAgent();
  const stream = await agent.stream(
    { messages: [new HumanMessage(message)] },
    {
      streamMode: "messages",
      signal: options?.signal,
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

export { createTextToSqlAgent, streamTextToSqlAgent };
