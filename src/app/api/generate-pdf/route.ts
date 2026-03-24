import { buildTypstSource } from "@/lib/typst-template";
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export async function POST(request: Request) {
  const { sessionId, createdAt, groundTruth, sitrep, forecasts, summary } =
    await request.json();

  const typstSource = buildTypstSource({
    sessionId,
    createdAt,
    groundTruth,
    sitrep: sitrep ?? null,
    forecasts,
    summary,
  });

  const dir = join(tmpdir(), "geopol-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const inputPath = join(dir, "report.typ");
  const outputPath = join(dir, "report.pdf");

  await writeFile(inputPath, typstSource, "utf-8");

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    execFile("typst", ["compile", inputPath, outputPath], (error) => {
      if (error) {
        reject(new Error(`Typst compilation failed: ${error.message}`));
        return;
      }
      readFile(outputPath).then(resolve).catch(reject);
    });
  });

  // Cleanup
  await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {});

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="geopol-full-report-${new Date(createdAt).toISOString().slice(0, 16).replace(/[T:]/g, "-")}-${sessionId.slice(0, 8)}.pdf"`,
    },
  });
}
