/**
 * 运行时由 `index.ts` 注入 `globalThis`（见 `installGlobalLibraries`）。
 * 业务代码无需 `import`，即可使用 `_` 与 `moment`；类型由此文件提供。
 */
export {};

declare global {
  /** Lodash（`lodash` 默认导出） */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- 与 Lodash 惯例一致
  var _: typeof import("lodash").default;
  /** Moment.js（`moment` 默认导出） */
  var moment: typeof import("moment").default;
}
