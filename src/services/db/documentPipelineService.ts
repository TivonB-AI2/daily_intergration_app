import { createServerFn } from "@tanstack/react-start";

export type PipelineStage =
  | "extract"
  | "summarize"
  | "tags"
  | "classify"
  | "report";

export type AiProvider = "anthropic" | "openai" | "ai-squared-bolt";

/** Every stage the pipeline knows how to run, in their canonical order.
 * A job/preset's own `stages` array is a subset of these, kept in this
 * relative order. */
export const PIPELINE_STAGES: {
  key: PipelineStage;
  label: string;
  description: string;
}[] = [
  {
    key: "extract",
    label: "Extract text",
    description: "Pull clean, readable text out of the uploaded file.",
  },
  {
    key: "summarize",
    label: "Summarize",
    description: "Generate a short summary of the extracted text.",
  },
  {
    key: "tags",
    label: "Extract tags/entities",
    description: "Pull out keywords, topics, and named entities.",
  },
  {
    key: "classify",
    label: "Classify document type",
    description: "Label the document (Contract, Invoice, Report, etc.).",
  },
  {
    key: "report",
    label: "Generate report",
    description:
      "Combine every stage's output into one formatted report, saved to Storage.",
  },
];

const STAGE_ORDER: PipelineStage[] = PIPELINE_STAGES.map((s) => s.key);

/** This app has no third-party PDF/Office parsing library installed, so
 * PDF/DOCX/ODT support is a hand-rolled, best-effort extractor (see
 * `documentTextExtraction.ts`) built on Node's built-in `zlib` — it works
 * well for simple/plain documents but can struggle with scanned/image-only
 * PDFs or unusual font encodings (surfaced as a clear stage error, not
 * silent garbage). Legacy binary `.doc` (pre-2007 Word) isn't a ZIP or
 * plain text and would need a much larger parser, so it's intentionally
 * not offered. */
export const ACCEPTED_FILE_EXTENSIONS = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".rtf",
  ".pdf",
  ".docx",
  ".odt",
];

function sortStages(stages: PipelineStage[]): PipelineStage[] {
  return [...stages].sort(
    (a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b),
  );
}

// ---------------------------------------------------------------------------
// Pipeline presets
// ---------------------------------------------------------------------------

export type PipelineConfigInput = {
  name: string;
  stages: PipelineStage[];
  provider: AiProvider;
};

export const listPipelineConfigs = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { pipelineConfigs } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(pipelineConfigs)
      .orderBy(desc(pipelineConfigs.createdAt));
  },
);

export const createPipelineConfig = createServerFn({ method: "POST" })
  .inputValidator((input: PipelineConfigInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { pipelineConfigs } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(pipelineConfigs)
      .values({
        name: data.name,
        stages: sortStages(data.stages),
        provider: data.provider,
      })
      .returning();
    return row;
  });

export const deletePipelineConfig = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { pipelineConfigs } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(pipelineConfigs).where(eq(pipelineConfigs.id, id));
  });

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export type CreateDocumentJobInput = {
  storageFileId?: number;
  fileName: string;
  pipelineConfigId?: number | null;
  stages: PipelineStage[];
  provider: AiProvider;
};

export const createDocumentJob = createServerFn({ method: "POST" })
  .inputValidator((input: CreateDocumentJobInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { documentJobs, pipelineStageResults } = await import(
      "@/server/db/schema"
    );
    const db = await getDb();
    const stages = sortStages(data.stages);

    const [job] = await db
      .insert(documentJobs)
      .values({
        storageFileId: data.storageFileId ?? null,
        fileName: data.fileName,
        pipelineConfigId: data.pipelineConfigId ?? null,
        stages,
        provider: data.provider,
        status: "pending",
      })
      .returning();

    if (stages.length > 0) {
      await db.insert(pipelineStageResults).values(
        stages.map((stage, i) => ({
          jobId: job.id,
          stage,
          stageOrder: i,
          status: "pending" as const,
        })),
      );
    }

    return job;
  });

export type DocumentJobWithStages = {
  job: import("@/server/db/schema").DocumentJob;
  stages: import("@/server/db/schema").PipelineStageResult[];
  storageFile: import("@/server/db/schema").StorageFile | null;
  reportStorageFile: import("@/server/db/schema").StorageFile | null;
};

export const listDocumentJobs = createServerFn({ method: "GET" }).handler(
  async (): Promise<DocumentJobWithStages[]> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { documentJobs, pipelineStageResults, storageFiles } = await import(
      "@/server/db/schema"
    );
    const { desc, inArray } = await import("drizzle-orm");
    const db = await getDb();

    const jobs = await db
      .select()
      .from(documentJobs)
      .orderBy(desc(documentJobs.createdAt));
    if (jobs.length === 0) return [];

    const jobIds = jobs.map((j) => j.id);
    const allStages = await db
      .select()
      .from(pipelineStageResults)
      .where(inArray(pipelineStageResults.jobId, jobIds));

    const fileIds = [
      ...new Set(
        jobs.flatMap((j) =>
          [j.storageFileId, j.reportStorageFileId].filter(
            (id): id is number => id != null,
          ),
        ),
      ),
    ];
    const files =
      fileIds.length > 0
        ? await db
            .select()
            .from(storageFiles)
            .where(inArray(storageFiles.id, fileIds))
        : [];
    const fileById = new Map(files.map((f) => [f.id, f]));

    return jobs.map((job) => ({
      job,
      stages: allStages
        .filter((s) => s.jobId === job.id)
        .sort((a, b) => a.stageOrder - b.stageOrder),
      storageFile: job.storageFileId
        ? (fileById.get(job.storageFileId) ?? null)
        : null,
      reportStorageFile: job.reportStorageFileId
        ? (fileById.get(job.reportStorageFileId) ?? null)
        : null,
    }));
  },
);

export const deleteDocumentJob = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { documentJobs } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(documentJobs).where(eq(documentJobs.id, id));
  });

// ---------------------------------------------------------------------------
// Stage execution
// ---------------------------------------------------------------------------

const MAX_STAGE_INPUT_CHARS = 12_000;

function truncate(text: string, max = MAX_STAGE_INPUT_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function stagePrompt(stage: PipelineStage, input: string): string {
  switch (stage) {
    case "extract":
      return `Extract and clean up the readable text content from the following file content. Preserve all key information and structure (headings, lists) as plain text. Return ONLY the extracted text, no commentary or preamble.\n\n---\n${truncate(input)}`;
    case "summarize":
      return `Write a concise summary (3-6 sentences) of the following text. Return ONLY the summary, no preamble.\n\n---\n${truncate(input)}`;
    case "tags":
      return `Extract 5-10 key tags, topics, or named entities from the following text. Return ONLY a comma-separated list, no preamble or numbering.\n\n---\n${truncate(input)}`;
    case "classify":
      return `Classify the following document into exactly one of: Contract, Invoice, Report, Article, Email, Other. Return ONLY one line in the exact format "Type: <label>" followed by a one-sentence justification on a new line.\n\n---\n${truncate(input)}`;
    case "report":
      return input;
  }
}

/** Reads whichever earlier stage's output the given stage depends on.
 * Every stage after "extract" reads from "extract"'s output (not the
 * previous stage in the array) since summarize/tags/classify are all
 * independent analyses of the same extracted text, not a chain. */
function findStageOutput(
  stages: import("@/server/db/schema").PipelineStageResult[],
  stage: PipelineStage,
): string | null {
  const output = stages.find((s) => s.stage === stage)?.output;
  // Treat a blank/whitespace-only output the same as "no output" — a stage
  // marked "done" with nothing real in it (e.g. an older run saved before
  // the Extract-stage empty-result guard existed) shouldn't be silently
  // read as valid input by a dependent stage.
  return output && output.trim() ? output : null;
}

export type RunStageInput = { jobId: number; stage: PipelineStage };

export const runPipelineStage = createServerFn({ method: "POST" })
  .inputValidator((input: RunStageInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { documentJobs, pipelineStageResults } = await import(
      "@/server/db/schema"
    );
    const { eq, and } = await import("drizzle-orm");
    const { callAiText } = await import("@/services/ai/aiModelService");
    const db = await getDb();

    const [job] = await db
      .select()
      .from(documentJobs)
      .where(eq(documentJobs.id, data.jobId));
    if (!job) throw new Error("Job not found");

    const allStages = await db
      .select()
      .from(pipelineStageResults)
      .where(eq(pipelineStageResults.jobId, data.jobId));
    const current = allStages.find((s) => s.stage === data.stage);
    if (!current) throw new Error("Stage not found on this job");

    await db
      .update(pipelineStageResults)
      .set({ status: "running", startedAt: new Date(), errorMessage: null })
      .where(eq(pipelineStageResults.id, current.id));
    await db
      .update(documentJobs)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(documentJobs.id, job.id));

    try {
      let outputText: string;
      let reportStorageFileId: number | null = null;

      if (data.stage === "extract") {
        let rawText: string;
        if (!job.storageFileId) {
          throw new Error("This job has no source file to extract from.");
        }
        const { downloadFile } = await import("@/server/s3/client");
        const { storageFiles } = await import("@/server/db/schema");
        const [file] = await db
          .select()
          .from(storageFiles)
          .where(eq(storageFiles.id, job.storageFileId));
        if (!file) throw new Error("Source file no longer exists in Storage.");
        const bytes = await downloadFile(file.key);
        if (!bytes) throw new Error("Source file not found in Storage.");
        const { extractRawText } = await import(
          "@/services/db/documentTextExtraction"
        );
        rawText = await extractRawText(bytes, job.fileName);
        outputText = await callAiText(job.provider, [
          { role: "user", content: stagePrompt("extract", rawText) },
        ]);
        // An empty/whitespace-only result here would otherwise get saved as
        // a "done" stage with no real output, which then makes every
        // dependent stage (summarize/tags/classify) fail downstream with
        // the confusing "Extract text must complete successfully" message
        // even though Extract itself shows as done. Fail Extract itself
        // instead, with a message that actually explains what happened.
        if (!outputText || !outputText.trim()) {
          throw new Error(
            "Extraction produced no usable text from this file — the AI model returned an empty result. The document may be blank, image-only, or too short to extract meaningfully.",
          );
        }
      } else if (data.stage === "report") {
        const extractOutput = findStageOutput(allStages, "extract");
        const summary = findStageOutput(allStages, "summarize");
        const tags = findStageOutput(allStages, "tags");
        const classification = findStageOutput(allStages, "classify");
        const sections = [
          `# Document Report: ${job.fileName}`,
          summary ? `## Summary\n${summary}` : null,
          tags ? `## Tags\n${tags}` : null,
          classification ? `## Classification\n${classification}` : null,
          extractOutput
            ? `## Extracted Text\n${truncate(extractOutput, 4000)}`
            : null,
        ].filter((s): s is string => s != null);
        outputText = await callAiText(job.provider, [
          {
            role: "user",
            content: `Combine the following pipeline stage outputs into one well-formatted Markdown report for a document named "${job.fileName}". Use headings for each section. Return ONLY the report markdown, no preamble.\n\n${sections.join("\n\n")}`,
          },
        ]);

        const { uploadFile } = await import("@/server/s3/client");
        const { storageFiles } = await import("@/server/db/schema");
        const key = `exports/document-pipeline/${Date.now()}-${job.fileName.replace(/\.[a-zA-Z0-9]+$/, "")}-report.md`;
        await uploadFile(key, new TextEncoder().encode(outputText), {
          contentType: "text/markdown",
        });
        const [reportFile] = await db
          .insert(storageFiles)
          .values({
            key,
            fileName: key.split("/").pop() as string,
            folder: "exports",
            contentType: "text/markdown",
            size: outputText.length,
          })
          .returning();
        reportStorageFileId = reportFile.id;
      } else {
        const extractOutput = findStageOutput(allStages, "extract");
        if (!extractOutput) {
          throw new Error(
            'The "Extract text" stage must complete successfully before this stage can run.',
          );
        }
        outputText = await callAiText(job.provider, [
          { role: "user", content: stagePrompt(data.stage, extractOutput) },
        ]);
      }

      await db
        .update(pipelineStageResults)
        .set({
          status: "done",
          output: outputText,
          completedAt: new Date(),
        })
        .where(eq(pipelineStageResults.id, current.id));

      const refreshedStages = await db
        .select()
        .from(pipelineStageResults)
        .where(eq(pipelineStageResults.jobId, job.id));
      const allDone = refreshedStages.every((s) => s.status === "done");
      const anyFailed = refreshedStages.some((s) => s.status === "failed");
      await db
        .update(documentJobs)
        .set({
          status: allDone ? "done" : anyFailed ? "failed" : "running",
          updatedAt: new Date(),
          ...(reportStorageFileId ? { reportStorageFileId } : {}),
        })
        .where(eq(documentJobs.id, job.id));

      return { success: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stage failed";
      await db
        .update(pipelineStageResults)
        .set({
          status: "failed",
          errorMessage: message,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(pipelineStageResults.jobId, job.id),
            eq(pipelineStageResults.stage, data.stage),
          ),
        );
      await db
        .update(documentJobs)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(documentJobs.id, job.id));
      throw new Error(message);
    }
  });
