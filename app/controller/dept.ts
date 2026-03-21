import type { Request, Response } from "express";
import { createTextToSqlAgent, streamTextToSqlAgent } from "../../agent/service/text_to_sql";
import { HttpError } from "../middleware/error_handler";
import { initSseResponse, writeSseText } from "../utils/sse";
import { createDept, deleteDept, getDept, updateDept } from "../service/dept";
function numParam(req: Request, name: string): number {
  const n = Number(req.params[name]);
  if (!Number.isFinite(n)) throw new HttpError(400, `invalid param: ${name}`);
  return n;
}

async function deptList(req: Request, res: Response) {
  const message = req.query.message as string;
  const result = await createTextToSqlAgent(message);
  res.json({ success: true, data: result });
}

/**
 * Text-to-SQL Agent 流式输出（SSE）：`GET /api/depts/stream?message=...`
 */
async function deptTextToSqlStream(req: Request, res: Response) {
  const raw = req.query.message;
  const message = raw == null ? "" : String(raw).trim();
  if (message === "") {
    throw new HttpError(400, "missing or empty query: message");
  }

  const abort = new AbortController();
  req.on("close", () => {
    abort.abort();
  });

  initSseResponse(res);

  try {
    for await (const text of streamTextToSqlAgent(message, { signal: abort.signal })) {
      writeSseText(res, text);
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    writeSseText(res, `Error: ${errMsg}`);
  } finally {
    res.end();
  }
}

async function deptGet(req: Request, res: Response) {
  const id = numParam(req, "id");
  const data = await getDept(id);
  res.json({ success: true, data });
}

async function deptCreate(req: Request, res: Response) {
  const body = req.body ?? {};
  const parentId = body.parentId ?? body.parent_id;
  const pathIds = body.pathIds ?? body.path_ids;
  const pathNames = body.pathNames ?? body.path_names;
  if (
    body.id == null ||
    body.name == null ||
    parentId == null ||
    pathIds == null ||
    pathNames == null
  ) {
    throw new HttpError(
      400,
      "missing fields: id,name,parentId/pathId,parent_id,pathIds/path_ids,pathNames/path_names",
    );
  }
  const data = await createDept({
    id: Number(body.id),
    name: String(body.name),
    parentId: Number(parentId),
    pathIds,
    pathNames,
  });
  res.status(201).json({ success: true, data });
}

async function deptUpdate(req: Request, res: Response) {
  const id = numParam(req, "id");
  const body = req.body ?? {};
  const data = await updateDept(id, body);
  res.json({ success: true, data });
}

async function deptDelete(req: Request, res: Response) {
  const id = numParam(req, "id");
  const data = await deleteDept(id);
  res.json({ success: true, data });
}

export { deptCreate, deptDelete, deptGet, deptList, deptTextToSqlStream, deptUpdate };
