import { QueryTypes } from "sequelize";
import { databaseConfig, sequelize } from "../config/_index";

/**
 * 列级结构信息（来自 `information_schema.COLUMNS`）。
 */
type TableColumnStructure = {
  /** 列名 */
  columnName: string;
  /** 逻辑类型，如 varchar、int */
  dataType: string;
  /** 完整列类型，如 varchar(255) */
  columnType: string;
  /** 是否可为空：`YES` / `NO` */
  isNullable: string;
  /** 默认值 */
  columnDefault: string | null;
  /** 列注释 */
  columnComment: string | null;
  /** 键：PRI / UNI / MUL 等 */
  columnKey: string | null;
  /** 额外属性，如 auto_increment */
  extra: string | null;
  /** 列顺序（从 1 起） */
  ordinalPosition: number;
};

/**
 * 约束类型（与 MySQL `TABLE_CONSTRAINTS.CONSTRAINT_TYPE` 一致）。
 */
type ConstraintKind = "PRIMARY KEY" | "UNIQUE" | "FOREIGN KEY" | "CHECK";

/**
 * 单条约束及其涉及列（复合主键/唯一/外键按 `ordinal` 对齐）。
 */
type TableConstraintInfo = {
  /** 约束名 */
  constraintName: string;
  /** 约束类别 */
  constraintType: ConstraintKind;
  /** 本表参与该约束的列名（顺序与定义一致） */
  columnNames: string[];
  /** 仅外键：被引用表 */
  referencedTable?: string;
  /** 仅外键：被引用列（与 `columnNames` 按位置一一对应） */
  referencedColumns?: string[];
  /** 仅外键：更新规则 */
  updateRule?: string | null;
  /** 仅外键：删除规则 */
  deleteRule?: string | null;
};

/**
 * 当前连接所指向的数据库（MySQL schema）在 `information_schema.SCHEMATA` 中的描述。
 *
 * @remarks `schemaComment` 依赖 MySQL 8.0.16+ 的 `SCHEMA_COMMENT`；旧版本会回退查询，结果为 `null`。
 */
type DatabaseSchemaDescription = {
  /** 数据库（schema）名 */
  schemaName: string;
  /** 默认字符集 */
  defaultCharacterSetName: string | null;
  /** 默认排序规则 */
  defaultCollationName: string | null;
  /** 数据库级注释（`CREATE DATABASE ... COMMENT`） */
  schemaComment: string | null;
};

/**
 * 单张用户表的名称、注释、列结构及约束汇总。
 */
type TableSchemaBundle = {
  /** 表名 */
  tableName: string;
  /** 表注释（`TABLE_COMMENT`） */
  tableComment: string | null;
  /** 表描述（与 `tableComment` 同源，均为 MySQL 表级 `COMMENT`） */
  tableDescription: string | null;
  /** 存储引擎 */
  engine: string | null;
  /** 表默认排序规则 */
  tableCollation: string | null;
  /** 列结构（按 `ORDINAL_POSITION` 排序） */
  columns: TableColumnStructure[];
  /** 约束列表（主键、唯一、外键、检查等） */
  constraints: TableConstraintInfo[];
};

type TableRow = {
  TABLE_NAME: string;
  TABLE_COMMENT: string | null;
  ENGINE: string | null;
  TABLE_COLLATION: string | null;
};

type SchemataRow = {
  SCHEMA_NAME: string;
  DEFAULT_CHARACTER_SET_NAME: string | null;
  DEFAULT_COLLATION_NAME: string | null;
  SCHEMA_COMMENT?: string | null;
};

/**
 * 读取当前 `databaseConfig.database` 对应的 schema 元数据（库级描述）。
 */
async function fetchDatabaseSchemaDescription(): Promise<DatabaseSchemaDescription> {
  const schemaName = databaseConfig.database;

  const sqlWithComment = `
    SELECT SCHEMA_NAME,
           DEFAULT_CHARACTER_SET_NAME,
           DEFAULT_COLLATION_NAME,
           SCHEMA_COMMENT
    FROM information_schema.SCHEMATA
    WHERE SCHEMA_NAME = :schemaName
    LIMIT 1
  `;

  try {
    const rows = await sequelize.query<SchemataRow>(sqlWithComment, {
      replacements: { schemaName },
      type: QueryTypes.SELECT,
    });
    const row = rows[0];
    if (!row) {
      return {
        schemaName,
        defaultCharacterSetName: null,
        defaultCollationName: null,
        schemaComment: null,
      };
    }
    return {
      schemaName: row.SCHEMA_NAME,
      defaultCharacterSetName: row.DEFAULT_CHARACTER_SET_NAME ?? null,
      defaultCollationName: row.DEFAULT_COLLATION_NAME ?? null,
      schemaComment: row.SCHEMA_COMMENT ?? null,
    };
  } catch {
    const sqlLegacy = `
      SELECT SCHEMA_NAME,
             DEFAULT_CHARACTER_SET_NAME,
             DEFAULT_COLLATION_NAME
      FROM information_schema.SCHEMATA
      WHERE SCHEMA_NAME = :schemaName
      LIMIT 1
    `;
    const rows = await sequelize.query<SchemataRow>(sqlLegacy, {
      replacements: { schemaName },
      type: QueryTypes.SELECT,
    });
    const row = rows[0];
    if (!row) {
      return {
        schemaName,
        defaultCharacterSetName: null,
        defaultCollationName: null,
        schemaComment: null,
      };
    }
    return {
      schemaName: row.SCHEMA_NAME,
      defaultCharacterSetName: row.DEFAULT_CHARACTER_SET_NAME ?? null,
      defaultCollationName: row.DEFAULT_COLLATION_NAME ?? null,
      schemaComment: null,
    };
  }
}

/**
 * {@link getAllTablesSchemaWithConstraints} 的完整返回：库级描述 + 全部基表详情。
 */
type AllTablesSchemaWithConstraintsResult = {
  database: DatabaseSchemaDescription;
  tables: TableSchemaBundle[];
};

type ColumnRow = {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
  COLUMN_COMMENT: string | null;
  COLUMN_KEY: string | null;
  EXTRA: string | null;
  ORDINAL_POSITION: number;
};

type ConstraintRow = {
  CONSTRAINT_NAME: string;
  TABLE_NAME: string;
  CONSTRAINT_TYPE: string;
  COLUMN_NAME: string | null;
  ORDINAL_POSITION: number | null;
  REFERENCED_TABLE_NAME: string | null;
  REFERENCED_COLUMN_NAME: string | null;
  UPDATE_RULE: string | null;
  DELETE_RULE: string | null;
};

const CONSTRAINT_TYPES: readonly ConstraintKind[] = [
  "PRIMARY KEY",
  "UNIQUE",
  "FOREIGN KEY",
  "CHECK",
];

function isConstraintKind(v: string): v is ConstraintKind {
  return (CONSTRAINT_TYPES as readonly string[]).includes(v);
}

function groupConstraints(rows: ConstraintRow[]): Map<string, TableConstraintInfo[]> {
  const byTable = new Map<string, Map<string, ConstraintRow[]>>();

  for (const r of rows) {
    const table = r.TABLE_NAME;
    const cname = r.CONSTRAINT_NAME;
    if (!byTable.has(table)) byTable.set(table, new Map());
    const cm = byTable.get(table)!;
    if (!cm.has(cname)) cm.set(cname, []);
    cm.get(cname)!.push(r);
  }

  const result = new Map<string, TableConstraintInfo[]>();

  for (const [tableName, cmap] of byTable) {
    const list: TableConstraintInfo[] = [];

    for (const [, parts] of cmap) {
      const first = parts[0];
      if (!isConstraintKind(first.CONSTRAINT_TYPE)) continue;

      const sorted = [...parts].sort(
        (a, b) => (a.ORDINAL_POSITION ?? 0) - (b.ORDINAL_POSITION ?? 0),
      );

      const columnNames = sorted
        .map((p) => p.COLUMN_NAME)
        .filter((n): n is string => n != null && n !== "");

      const base: TableConstraintInfo = {
        constraintName: first.CONSTRAINT_NAME,
        constraintType: first.CONSTRAINT_TYPE,
        columnNames,
      };

      if (first.CONSTRAINT_TYPE === "FOREIGN KEY") {
        const refCols = sorted
          .map((p) => p.REFERENCED_COLUMN_NAME)
          .filter((n): n is string => n != null && n !== "");
        base.referencedTable = first.REFERENCED_TABLE_NAME ?? undefined;
        base.referencedColumns = refCols.length ? refCols : undefined;
        base.updateRule = first.UPDATE_RULE;
        base.deleteRule = first.DELETE_RULE;
      }

      list.push(base);
    }

    list.sort((a, b) => a.constraintName.localeCompare(b.constraintName));
    result.set(tableName, list);
  }

  return result;
}

/**
 * 获取当前 Sequelize 连接所指向数据库中**全部用户表**的元数据：
 * 表名、表注释、列结构（字段类型、可空、默认值、列注释等）、以及主键/唯一/外键/检查等约束信息。
 *
 * @remarks
 * - 仅包含 `TABLE_TYPE = 'BASE TABLE'` 的表，不包含 `VIEW`。
 * - 数据来源于 MySQL `information_schema`（`TABLES`、`COLUMNS`、`TABLE_CONSTRAINTS`、`KEY_COLUMN_USAGE`、`REFERENTIAL_CONSTRAINTS`）。
 * - 外键的 `referencedColumns` 与本地 `columnNames` 按 `ORDINAL_POSITION` 对齐。
 *
 * @returns 包含 {@link DatabaseSchemaDescription `database`}（当前库描述）与 {@link TableSchemaBundle `tables`}（每张表含 {@link TableSchemaBundle.tableDescription `tableDescription`}），表按名升序
 *
 * @example
 * ```ts
 * const { database, tables } = await getAllTablesSchemaWithConstraints();
 * console.log(database.schemaComment, tables[0]?.tableDescription);
 * ```
 */
async function getAllTablesSchemaWithConstraints(): Promise<AllTablesSchemaWithConstraintsResult> {
  const schemaName = databaseConfig.database;
  const database = await fetchDatabaseSchemaDescription();

  const tableSql = `
    SELECT TABLE_NAME,
           IFNULL(TABLE_COMMENT, '') AS TABLE_COMMENT,
           ENGINE,
           TABLE_COLLATION
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = :schemaName
      AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME ASC
  `;

  const columnSql = `
    SELECT TABLE_NAME,
           COLUMN_NAME,
           DATA_TYPE,
           COLUMN_TYPE,
           IS_NULLABLE,
           COLUMN_DEFAULT,
           IFNULL(COLUMN_COMMENT, '') AS COLUMN_COMMENT,
           COLUMN_KEY,
           EXTRA,
           ORDINAL_POSITION
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = :schemaName
    ORDER BY TABLE_NAME ASC, ORDINAL_POSITION ASC
  `;

  const constraintSql = `
    SELECT tc.CONSTRAINT_NAME,
           tc.TABLE_NAME,
           tc.CONSTRAINT_TYPE,
           kcu.COLUMN_NAME,
           kcu.ORDINAL_POSITION,
           kcu.REFERENCED_TABLE_NAME,
           kcu.REFERENCED_COLUMN_NAME,
           rc.UPDATE_RULE,
           rc.DELETE_RULE
    FROM information_schema.TABLE_CONSTRAINTS tc
    LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
      ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND tc.TABLE_NAME = kcu.TABLE_NAME
      AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON tc.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
      AND tc.TABLE_NAME = rc.TABLE_NAME
      AND tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
    WHERE tc.TABLE_SCHEMA = :schemaName
      AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY', 'CHECK')
    ORDER BY tc.TABLE_NAME ASC,
             tc.CONSTRAINT_TYPE ASC,
             tc.CONSTRAINT_NAME ASC,
             kcu.ORDINAL_POSITION ASC
  `;

  const [tableRows, columnRows, constraintRows] = await Promise.all([
    sequelize.query<TableRow>(tableSql, {
      replacements: { schemaName },
      type: QueryTypes.SELECT,
    }),
    sequelize.query<ColumnRow>(columnSql, {
      replacements: { schemaName },
      type: QueryTypes.SELECT,
    }),
    sequelize.query<ConstraintRow>(constraintSql, {
      replacements: { schemaName },
      type: QueryTypes.SELECT,
    }),
  ]);

  const columnsByTable = new Map<string, TableColumnStructure[]>();
  for (const c of columnRows) {
    const col: TableColumnStructure = {
      columnName: c.COLUMN_NAME,
      dataType: c.DATA_TYPE,
      columnType: c.COLUMN_TYPE,
      isNullable: c.IS_NULLABLE,
      columnDefault: c.COLUMN_DEFAULT,
      columnComment: c.COLUMN_COMMENT === "" ? null : c.COLUMN_COMMENT,
      columnKey: c.COLUMN_KEY === "" ? null : c.COLUMN_KEY,
      extra: c.EXTRA === "" ? null : c.EXTRA,
      ordinalPosition: c.ORDINAL_POSITION,
    };
    if (!columnsByTable.has(c.TABLE_NAME)) columnsByTable.set(c.TABLE_NAME, []);
    columnsByTable.get(c.TABLE_NAME)!.push(col);
  }

  const constraintsByTable = groupConstraints(constraintRows);

  const tables = tableRows.map((t) => {
    const comment = t.TABLE_COMMENT === "" ? null : t.TABLE_COMMENT;
    return {
      tableName: t.TABLE_NAME,
      tableComment: comment,
      tableDescription: comment,
      engine: t.ENGINE,
      tableCollation: t.TABLE_COLLATION,
      columns: columnsByTable.get(t.TABLE_NAME) ?? [],
      constraints: constraintsByTable.get(t.TABLE_NAME) ?? [],
    };
  });

  return { database, tables };
}

export type {
  AllTablesSchemaWithConstraintsResult,
  ConstraintKind,
  DatabaseSchemaDescription,
  TableColumnStructure,
  TableConstraintInfo,
  TableSchemaBundle,
};
export { getAllTablesSchemaWithConstraints };
