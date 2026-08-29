// Daily MISA export job. For every active org, build yesterday's zip
// and drop it on local disk (and SFTP when ssh2 is configured). The
// bookkeeper pulls from either location.
//
// ponytail: no ssh2 dep. SFTP is a non-trivial wire protocol; until an
// SLA needs real push, the operator copies the file with scp. The
// env-driven hook is here so wiring ssh2 later is one new branch.

import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../db";
import { buildGeneralLedgerCsv, buildManifest, buildSalesInvoiceCsv, toMisaDate } from "./misa";
import { buildZip } from "./misa-zip";

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

function yesterday(): { from: Date; to: Date } {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setUTCDate(to.getUTCDate() - 1);
  return { from, to };
}

export async function buildOrgZip(
  orgId: string,
  from: Date,
  to: Date
): Promise<{ name: string; bytes: Buffer; counts: { salesInvoice: number; generalLedger: number } }> {
  const [salesCsv, glCsv] = await Promise.all([
    buildSalesInvoiceCsv({ from, to, orgId }),
    buildGeneralLedgerCsv({ from, to, orgId }),
  ]);
  const salesLines = salesCsv.split("\r\n").filter(Boolean).length - 1;
  const glLines = glCsv.split("\r\n").filter(Boolean).length - 1;
  const manifest = buildManifest({
    generatedAt: new Date().toISOString(),
    orgId,
    from: toMisaDate(from),
    to: toMisaDate(to),
    rows: { salesInvoice: salesLines, generalLedger: glLines },
  });
  const stamp = `${ymd(from)}_${ymd(to)}`;
  const name = `misa_${orgId}_${stamp}.zip`;
  const bytes = buildZip([
    { name: "SalesInvoice.csv", data: Buffer.from(salesCsv, "utf8") },
    { name: "GeneralLedger.csv", data: Buffer.from(glCsv, "utf8") },
    { name: "manifest.json", data: Buffer.from(manifest, "utf8") },
  ]);
  return { name, bytes, counts: { salesInvoice: salesLines, generalLedger: glLines } };
}

export async function runDailyMisaExport(): Promise<{ produced: number; path: string | null }> {
  const { from, to } = yesterday();
  const orgs = await prisma.organization.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] } },
    select: { id: true, slug: true },
  });
  const outDir = process.env.MISA_EXPORT_DIR ?? path.join(process.cwd(), "var", "misa");
  await fs.mkdir(outDir, { recursive: true });

  let produced = 0;
  for (const o of orgs) {
    const { name, bytes, counts } = await buildOrgZip(o.id, from, to);
    const target = path.join(outDir, name);
    await fs.writeFile(target, bytes);
    console.log(JSON.stringify({
      level: "info", event: "misa_export", org: o.slug ?? o.id, file: name,
      bytes: bytes.length, ...counts,
    }));
    produced++;
  }

  const sftpHost = process.env.MISA_SFTP_HOST;
  if (!sftpHost) return { produced, path: outDir };
  console.log(JSON.stringify({
    level: "info", event: "misa_sftp_skip", reason: "ssh2 not configured",
    hint: `MISA_SFTP_HOST=${sftpHost} but no sftp client is installed; files in ${outDir}`,
  }));
  return { produced, path: outDir };
}
