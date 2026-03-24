import type { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import type { BaseMessage } from "@langchain/core/messages";
import { StructuredTool, Tool, type ToolRunnableConfig } from "@langchain/core/tools";
import { getConfig } from "@langchain/langgraph";
import { Parser } from "node-sql-parser";
import type { AST, Select } from "node-sql-parser";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/_index";
import {
  getAllTablesSchemaWithConstraints,
  type TableConstraintInfo,
  type TableSchemaBundle,
} from "../../utils/db_tools";
import { z } from "zod";
import {
  TEXT_TO_SQL_AGENT_CONTEXT_CONFIG_KEY,
  textToSqlAgentContextSchema,
  type TextToSqlAgentContext,
} from "../context/text_to_sql_agent_context";
import { getForeignKeyConstraint } from "../prompt/foreign_key_constraint";

const tableSchemaToolInputSchema = z.object({
  tableNames: z.array(z.string()).describe("要查询的表名数组"),
});

/** prompt 中按表名补充的外键描述：`表名 -> { "本列=>引用表.引用列": "关系/基数" }` */
type PromptForeignKeyMap = Record<string, Record<string, string>>;

/** LangGraph Pregel 在 `configurable` 中挂载的 scratchpad（与官方 ToolNode 一致）。 */
type PregelScratchpad = {
  currentTaskInput?: unknown;
};

/**
 * createAgent 的 ToolNode 在 `tool.invoke(..., config)` 中传入的扩展字段（见 `langchain/dist/agents/nodes/ToolNode.js`）。
 */
type LangGraphToolInvokeConfig = ToolRunnableConfig & {
  /** 当前图任务输入状态（与 `__pregel_scratchpad.currentTaskInput` 一致，通常含 `messages`） */
  state?: unknown;
  toolCallId?: string;
  /** ToolNode 在部分版本里会附带内层 `config`，与顶层 spread 重复时可在此取 `context` */
  config?: ToolRunnableConfig;
};

/**
 * 从 Tool `invoke` 第二参取出原始 `context`。
 * 顺序：`context` → `config.context` → `configurable[__text_to_sql_agent_context__]`（与 skill 层镜像）→ `getConfig()` 同上。
 * 说明：LangGraph 在部分路径下不会把 `RunnableConfig.context` 传到 Tool 的 `invoke` 第二参，故 skill 将同一份对象写入 `configurable` 约定键。
 */
function pickRawContextFromToolInvokeConfig(cfg: LangGraphToolInvokeConfig | undefined): unknown {
  if (cfg) {
    if (cfg.context !== undefined && cfg.context !== null) {
      return cfg.context;
    }
    const nested = cfg.config?.context;
    if (nested !== undefined && nested !== null) {
      return nested;
    }
    const fromConfigurable = cfg.configurable?.[TEXT_TO_SQL_AGENT_CONTEXT_CONFIG_KEY];
    if (fromConfigurable !== undefined && fromConfigurable !== null) {
      return fromConfigurable;
    }
  }
  const fromAls = getConfig()?.context;
  if (fromAls !== undefined && fromAls !== null) {
    return fromAls;
  }
  const fromAlsCfg = getConfig()?.configurable?.[TEXT_TO_SQL_AGENT_CONTEXT_CONFIG_KEY];
  if (fromAlsCfg !== undefined && fromAlsCfg !== null) {
    return fromAlsCfg;
  }
  return undefined;
}

/**
 * 将 `invoke` 传入的 `context` 原始值按本项目的 `contextSchema` 做校验，得到类型安全的上下文。
 * `contextSchema` **本身**不会出现在 `parentConfig` 里（它是 `createAgent` 时的静态定义）；工具里只能拿到**每次调用传入的 context 值**。
 */
function parseTextToSqlAgentContextFromConfig(raw: unknown): TextToSqlAgentContext | undefined {
  if (raw == null) {
    return undefined;
  }
  const parsed = textToSqlAgentContextSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * 从 `Tool._call` / `StructuredTool._call` 第三参解析 **Agent 运行时状态** 与 **运行时上下文值**。
 * LangChain 在 ToolNode 里会把 `config.configurable.__pregel_scratchpad.currentTaskInput` 同时作为顶层 `state` 传入 `invoke`。
 *
 * **与 `contextSchema` 的关系**：`createAgent({ contextSchema })` 只声明**形状**；运行时字段在
 * `agent.invoke(..., { context: { userId, ... } })` 里传入，本函数返回的 **`context`** 即为其经 {@link textToSqlAgentContextSchema} **校验后**的对象。
 * 若需在其他模块使用 **schema 对象本身**，请 `import { textToSqlAgentContextSchema } from "../context/text_to_sql_agent_context"`，它不会从 `parentConfig` 取出。
 *
 * @param parentConfig - `invoke`/`call` 时注入的配置（与 ToolNode 传入对象一致）
 */
function getAgentRuntimeStateFromToolConfig(parentConfig?: ToolRunnableConfig): {
  state: unknown;
  messages: BaseMessage[] | undefined;
  /** 本次调用经 `textToSqlAgentContextSchema` 解析后的上下文；未传或校验失败则为 `undefined` */
  context: TextToSqlAgentContext | undefined;
  toolCallId: string | undefined;
  toolCall: ToolRunnableConfig["toolCall"];
  configurable: Record<string, unknown> | undefined;
  metadata: ToolRunnableConfig["metadata"];
} {
  const cfg = parentConfig as LangGraphToolInvokeConfig | undefined;
  const explicitState = cfg?.state;
  const scratch = cfg?.configurable?.["__pregel_scratchpad"] as PregelScratchpad | undefined;
  const fromScratchpad = scratch?.currentTaskInput;
  const state = explicitState !== undefined ? explicitState : fromScratchpad;

  let messages: BaseMessage[] | undefined;
  if (state !== null && state !== undefined && typeof state === "object" && "messages" in state) {
    const m = (state as { messages: unknown }).messages;
    if (Array.isArray(m)) {
      messages = m as BaseMessage[];
    }
  }

  const rawCfg = cfg?.configurable;
  return {
    state,
    messages,
    context: parseTextToSqlAgentContextFromConfig(pickRawContextFromToolInvokeConfig(cfg)),
    toolCallId: cfg?.toolCallId,
    toolCall: parentConfig?.toolCall,
    configurable:
      rawCfg != null && typeof rawCfg === "object"
        ? (rawCfg as Record<string, unknown>)
        : undefined,
    metadata: parentConfig?.metadata,
  };
}

/**
 * 将 {@link TableSchemaBundle} 转为可读 context 文本（表描述、列、外键）。
 */
class TableSchemaContextFormatter {
  formatColumnLines(table: TableSchemaBundle): string {
    const lines = table.columns.map((col) => {
      const note = col.columnComment ? ` [注释：${col.columnComment}]` : " [注释：无]";
      return `  - ${col.columnName}: ${col.columnType}${note}`;
    });
    return lines.length ? `列信息:\n${lines.join("\n")}` : "列信息:\n  （无列）";
  }

  private formatFkFromDb(fk: TableConstraintInfo): string {
    const local = fk.columnNames.join(",");
    const refTable = fk.referencedTable ?? "?";
    const refCols = (fk.referencedColumns ?? []).join(",");
    const tag = fk.deleteRule ?? fk.updateRule ?? "1:1";
    return `  - ${local}=>${refTable}.${refCols} [${tag}]`;
  }

  formatForeignKeySection(table: TableSchemaBundle, promptMap: PromptForeignKeyMap): string {
    const fromDb = table.constraints
      .filter((c) => c.constraintType === "FOREIGN KEY")
      .map((c) => this.formatFkFromDb(c));
    const extra = promptMap[table.tableName];
    const fromPrompt = extra
      ? Object.entries(extra).map(([edge, card]) => `  - ${edge} [${card}]`)
      : [];
    const merged = [...fromDb];
    for (const line of fromPrompt) {
      if (!merged.some((m) => m.trim() === line.trim())) merged.push(line);
    }
    if (merged.length === 0) return "外键约束:\n  （无）";
    return `外键约束:\n${merged.join("\n")}`;
  }

  formatTableContext(table: TableSchemaBundle, promptFk: PromptForeignKeyMap): string {
    const desc = table.tableDescription ?? table.tableComment ?? "暂无描述";
    return [
      `表名:${table.tableName}`,
      `表描述:${desc}`,
      this.formatColumnLines(table),
      this.formatForeignKeySection(table, promptFk),
    ].join("\n");
  }

  /** 多张表之间用分隔线拼接 */
  formatMultipleTables(tables: TableSchemaBundle[], promptFk: PromptForeignKeyMap): string {
    return tables.map((t) => this.formatTableContext(t, promptFk)).join("\n\n---\n\n");
  }
}

class TableInfoTool extends Tool {
  name = "sql_db_list_tables";
  description = "查询MySQL数据库中所有表名及描述信息";

  async _call(
    _input?: string,
    _runManager?: CallbackManagerForToolRun,
    parentConfig?: ToolRunnableConfig,
  ): Promise<string> {
    try {
      void getAgentRuntimeStateFromToolConfig(parentConfig);

      const tableLists = await getAllTablesSchemaWithConstraints().then((res) => res.tables);
      let context = "数据库一共有：" + tableLists.length + "张表，表名<描述>信息如下：\n";
      const tableInfoListString = tableLists
        .map((table) => `${table.tableName}<${table.tableDescription || "暂无描述"}>`)
        .join("\n");
      context += tableInfoListString;
      return context;
    } catch (error) {
      throw error;
    }
  }
}

class TableSchemaTool extends StructuredTool<typeof tableSchemaToolInputSchema> {
  name = "sql_tables_schema_tool";
  description = "传入指定的表名数组，获取对应表的结构信息列表，包括列定义、主键、外键。";
  schema = tableSchemaToolInputSchema;

  async _call(
    input: z.infer<typeof tableSchemaToolInputSchema>,
    _runManager?: CallbackManagerForToolRun,
    parentConfig?: ToolRunnableConfig,
  ): Promise<string> {
    void getAgentRuntimeStateFromToolConfig(parentConfig);

    const { tables } = await getAllTablesSchemaWithConstraints();
    const wanted = new Set(input.tableNames);
    const matched = tables.filter((t) => wanted.has(t.tableName));
    const promptFk = getForeignKeyConstraint() as PromptForeignKeyMap;
    const tableSchemaContextFormatter = new TableSchemaContextFormatter();
    return tableSchemaContextFormatter.formatMultipleTables(matched, promptFk);
  }
}

class SqlCheckTool extends Tool<boolean> {
  name = "sql_check_tool";
  description =
    "检查 SQL 是否为合法 MySQL 语法且仅为 SELECT（可含 UNION、WITH 等），输入 SQL 字符串，返回 true/false。";

  private readonly parser = new Parser();

  /**
   * 将 parse 得到的 `ast` 规范为语句数组（单条语句也可能为数组）。
   */
  private static normalizeStatementList(ast: AST | AST[]): AST[] {
    return Array.isArray(ast) ? ast : [ast];
  }

  /**
   * 递归校验 AST 链为 SELECT：`WITH` 内子查询、UNION 后的 `_next` 链均为 select。
   */
  private static isPureSelectAst(node: AST): boolean {
    if (node.type !== "select") return false;
    const sel = node as Select;
    if (sel.with?.length) {
      for (const w of sel.with) {
        if (!SqlCheckTool.isPureSelectAst(w.stmt.ast)) return false;
      }
    }
    if (sel._next) return SqlCheckTool.isPureSelectAst(sel._next);
    return true;
  }

  /**
   * 静态入口：不依赖 Tool 实例即可校验（便于在 service/agent 中直接调用）。
   */
  static validateSelectOnlySql(sql: string): boolean {
    return new SqlCheckTool().validateSelectOnly(sql);
  }

  /**
   * 校验：MySQL 语法可解析、且仅含一条语句，且该语句为 SELECT 族（含 UNION/CTE）。
   * 子类可重写以叠加白名单表名等扩展规则。
   */
  protected validateSelectOnly(sql: string): boolean {
    const trimmed = sql.trim();
    if (!trimmed) return false;
    let ast: AST | AST[];
    try {
      ({ ast } = this.parser.parse(trimmed, { database: "MySQL" }));
    } catch {
      return false;
    }
    const statements = SqlCheckTool.normalizeStatementList(ast);
    if (statements.length !== 1) return false;
    return SqlCheckTool.isPureSelectAst(statements[0]);
  }

  async _call(
    sql: string,
    _runManager?: CallbackManagerForToolRun,
    parentConfig?: ToolRunnableConfig,
  ): Promise<boolean> {
    void getAgentRuntimeStateFromToolConfig(parentConfig);

    return this.validateSelectOnly(sql ?? "");
  }

  /**
   * 将查询结果序列化为 JSON 字符串（兼容 `bigint` 等无法直接 `JSON.stringify` 的值）。
   */
  static stringifyQueryRows(rows: unknown): string {
    return JSON.stringify(rows, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
  }

  /**
   * 使用 MySQL `EXPLAIN` 对已通过 {@link SqlCheckTool.validateSelectOnlySql} 的 SELECT 做服务端校验，
   * 并将 EXPLAIN 结果打印到日志（JSON 一行）。
   *
   * @param validatedSelectSql 已校验为单条 SELECT 的 SQL，勿传入非 SELECT。
   */
  static async explainSelectWithLog(
    validatedSelectSql: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const explainSql = `EXPLAIN ${validatedSelectSql}`;
      const rows = await sequelize.query(explainSql, { type: QueryTypes.SELECT });
      console.log("[SqlCheckTool] EXPLAIN result:", SqlCheckTool.stringifyQueryRows(rows));
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `EXPLAIN 校验失败: ${message}` };
    }
  }
}

class QuerySqlTool extends Tool<string> {
  name = "sql_query_tool";
  description =
    "根据输入的原生 SQL 字符串执行只读查询（仅允许 SELECT），返回 JSON 字符串形式的结果集。";

  async _call(
    input: string,
    _runManager?: CallbackManagerForToolRun,
    parentConfig?: ToolRunnableConfig,
  ): Promise<string> {
    void getAgentRuntimeStateFromToolConfig(parentConfig);

    return this.executeSelectQuery(input ?? "");
  }

  /**
   * 校验为合法单条 SELECT → MySQL `EXPLAIN`（不通过则返回字符串 `"false"`）→ 执行查询；
   * 成功返回结果集 JSON 字符串；其它失败返回带 `error` 的 JSON。
   */
  async executeSelectQuery(sql: string): Promise<string> {
    const trimmed = sql.trim();
    if (!trimmed) {
      return JSON.stringify({ error: "SQL 不能为空" });
    }
    if (!SqlCheckTool.validateSelectOnlySql(trimmed)) {
      return JSON.stringify({ error: "仅允许执行语法正确的单条 SELECT 语句" });
    }
    try {
      const explainOutcome = await SqlCheckTool.explainSelectWithLog(trimmed);
      if (!explainOutcome.ok) {
        return "false";
      }
      const rows = await sequelize.query(trimmed, { type: QueryTypes.SELECT });
      return SqlCheckTool.stringifyQueryRows(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: message });
    }
  }
}

const tools = [new TableInfoTool(), new TableSchemaTool(), new SqlCheckTool(), new QuerySqlTool()];
export {
  TableInfoTool,
  TableSchemaTool,
  SqlCheckTool,
  QuerySqlTool,
  tools,
  getAgentRuntimeStateFromToolConfig,
  parseTextToSqlAgentContextFromConfig,
};
