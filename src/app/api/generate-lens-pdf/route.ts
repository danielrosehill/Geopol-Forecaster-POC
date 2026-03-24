import { buildLensTypstSource } from "@/lib/typst-template";
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export async function POST(request: Request) {
  const { lensId, lensName, agentModel, content, sessionId, createdAt } =
    await request.json();

  if (!content || !lensId) {
    return new Response("Missing lens content", { status: 400 });
  }

  const typstSource = buildLensTypstSource({
    lensId,
    lensName,
    agentModel,
    content,
    sessionId,
    createdAt,
  });

  const dir = join(tmpdir(), "geopol-lens-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const inputPath = join(dir, "lens.typ");
  const outputPath = join(dir, "lens.pdf");

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

  await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {});

  const safeName = lensName.toLowerCase().replace(/\s+/g, "-");
  const ts = new Date(createdAt).toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const filename = `${safeName}-forecast-${ts}-${sessionId.slice(0, 8)}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
