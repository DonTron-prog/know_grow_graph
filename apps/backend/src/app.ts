import cors from "cors";
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import {
  applyGraphPatch,
  applyPatchRequestSchema,
  graphMetaFromState,
  hasBlockers,
  parseGraphState,
  replaceWorkingGraphRequestSchema,
  validateGraphPatch,
  validateGraphState,
  validatePatchRequestSchema,
  type ValidationResult
} from "@know-grow/shared";
import {
  loadSnapshotsMeta,
  loadSourceGraph,
  loadWorkingGraph,
  saveWorkingGraph,
  type BackendPaths
} from "./persistence.ts";

export type CreateAppOptions = {
  paths: BackendPaths;
  version?: string;
  piCoderAvailable?: boolean;
};

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): express.RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

function validationDetails(validationResults: ValidationResult[]): { validationResults: ValidationResult[] } {
  return { validationResults };
}

function badRequestFromZod(error: unknown): HttpError {
  return new HttpError(400, "invalid_request", "Request body does not match the required API shape.", error);
}

function sendApiError(res: Response, error: HttpError): void {
  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    }
  });
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();
  const version = options.version ?? "0.1.0";

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version, piCoderAvailable: options.piCoderAvailable ?? false });
  });

  app.get(
    "/api/source/meta",
    asyncRoute(async (_req, res) => {
      res.json(graphMetaFromState(await loadSourceGraph(options.paths), true));
    })
  );

  app.get(
    "/api/source/graph",
    asyncRoute(async (_req, res) => {
      res.json(await loadSourceGraph(options.paths));
    })
  );

  app.get(
    "/api/working/graph",
    asyncRoute(async (_req, res) => {
      res.json(await loadWorkingGraph(options.paths));
    })
  );

  app.put(
    "/api/working/graph",
    asyncRoute(async (req, res) => {
      const parsedRequest = replaceWorkingGraphRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const validationResults = validateGraphState(parsedRequest.data.graph);
      if (hasBlockers(validationResults)) {
        throw new HttpError(
          422,
          "invalid_working_graph",
          "Working graph validation failed; current working graph was not changed.",
          validationDetails(validationResults)
        );
      }

      const graph = parseGraphState({
        ...parsedRequest.data.graph,
        stateType: "working",
        updatedAt: new Date().toISOString()
      });
      await saveWorkingGraph(options.paths, graph);
      res.json({ graph, validationResults });
    })
  );

  app.post(
    "/api/patch/validate",
    asyncRoute(async (req, res) => {
      const parsedRequest = validatePatchRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const workingGraph = await loadWorkingGraph(options.paths);
      res.json(validateGraphPatch(workingGraph, parsedRequest.data.patch));
    })
  );

  app.post(
    "/api/patch/apply",
    asyncRoute(async (req, res) => {
      const parsedRequest = applyPatchRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const workingGraph = await loadWorkingGraph(options.paths);
      const patchResult = applyGraphPatch(workingGraph, parsedRequest.data.patch);
      if (hasBlockers(patchResult.validationResults)) {
        throw new HttpError(
          422,
          "patch_validation_failed",
          "Patch validation failed; current working graph was not changed.",
          validationDetails(patchResult.validationResults)
        );
      }

      const graph = parseGraphState({
        ...patchResult.graph,
        stateType: "working",
        updatedAt: new Date().toISOString()
      });
      await saveWorkingGraph(options.paths, graph);
      res.json({
        graph,
        appliedPatch: patchResult.patch,
        validationResults: patchResult.validationResults,
        actionSummary: patchResult.actionSummary,
        changedElementIds: patchResult.changedElementIds
      });
    })
  );

  app.get(
    "/api/snapshots",
    asyncRoute(async (_req, res) => {
      res.json({ snapshots: await loadSnapshotsMeta(options.paths) });
    })
  );

  app.use((_req, _res, next) => {
    next(new HttpError(404, "not_found", "Route not found."));
  });

  app.use(apiErrorHandler);

  return app;
}

const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (error instanceof HttpError) {
    sendApiError(res, error);
    return;
  }

  if (isJsonSyntaxError(error)) {
    sendApiError(res, new HttpError(400, "malformed_json", "Request body must be valid JSON."));
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown backend error";
  sendApiError(res, new HttpError(500, "internal_error", message));
};

function isJsonSyntaxError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) {
    return false;
  }
  const maybeBodyParserError = error as SyntaxError & { status?: number; type?: string };
  return maybeBodyParserError.status === 400 || maybeBodyParserError.type === "entity.parse.failed";
}
