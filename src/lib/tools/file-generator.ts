import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

function resolveOut(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE, filePath);
}

export interface GenerateResult {
    success: boolean;
    path?: string;
    size?: number;
    error?: string;
    message?: string;
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

export function generateMarkdown(content: string, filePath = 'output.md'): GenerateResult {
    ensureWorkspace();
    try {
        const out = resolveOut(filePath.endsWith('.md') ? filePath : filePath + '.md');
        const dir = path.dirname(out);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(out, content, 'utf8');
        return { success: true, path: out, size: Buffer.byteLength(content), message: `Markdown saved: ${out}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

export function generateJson(data: any, filePath = 'output.json', indent = 2): GenerateResult {
    ensureWorkspace();
    try {
        const out = resolveOut(filePath.endsWith('.json') ? filePath : filePath + '.json');
        const dir = path.dirname(out);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const content = typeof data === 'string' ? data : JSON.stringify(data, null, indent);
        fs.writeFileSync(out, content, 'utf8');
        return { success: true, path: out, size: Buffer.byteLength(content), message: `JSON saved: ${out}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

export function generateCsv(
    data: (string | number | null)[][] | Record<string, any>[],
    filePath = 'output.csv',
    delimiter = ','
): GenerateResult {
    ensureWorkspace();
    try {
        const out = resolveOut(filePath.endsWith('.csv') ? filePath : filePath + '.csv');
        const dir = path.dirname(out);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        let csvContent = '';

        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
            // Array of objects
            const records = data as Record<string, any>[];
            const headers = Object.keys(records[0]);
            csvContent += headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(delimiter) + '\n';
            for (const row of records) {
                csvContent += headers.map(h => {
                    const v = row[h];
                    if (v === null || v === undefined) return '';
                    const s = String(v).replace(/"/g, '""');
                    return s.includes(delimiter) || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
                }).join(delimiter) + '\n';
            }
        } else {
            // Array of arrays
            const rows = data as (string | number | null)[][];
            for (const row of rows) {
                csvContent += row.map(v => {
                    if (v === null || v === undefined) return '';
                    const s = String(v).replace(/"/g, '""');
                    return s.includes(delimiter) || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
                }).join(delimiter) + '\n';
            }
        }

        fs.writeFileSync(out, csvContent, 'utf8');
        return { success: true, path: out, size: Buffer.byteLength(csvContent), message: `CSV saved: ${out} (${data.length} rows)` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

export function generateHtml(
    content: string,
    filePath = 'output.html',
    title = 'Generated Page',
    includeWrapper = true
): GenerateResult {
    ensureWorkspace();
    try {
        const out = resolveOut(filePath.endsWith('.html') ? filePath : filePath + '.html');
        const dir = path.dirname(out);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const html = includeWrapper && !content.trim().startsWith('<!DOCTYPE')
            ? `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
    h1,h2,h3 { color: #1a1a1a; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    pre { background: #f0f0f0; padding: 1rem; border-radius: 6px; overflow-x: auto; }
  </style>
</head>
<body>
${content}
</body>
</html>`
            : content;

        fs.writeFileSync(out, html, 'utf8');
        return { success: true, path: out, size: Buffer.byteLength(html), message: `HTML saved: ${out}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── PDF (pdfkit — pure JS, no browser dependency) ───────────────────────────

function stripHtml(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, ' | ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export async function generatePdf(
    content: string,
    filePath = 'output.pdf',
    title = 'Generated Document',
    fromHtml = false
): Promise<GenerateResult> {
    ensureWorkspace();
    const out = resolveOut(filePath.endsWith('.pdf') ? filePath : filePath + '.pdf');
    const dir = path.dirname(out);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
        const PDFDocument = (await import('pdfkit')).default;
        const doc = new PDFDocument({ margin: 72, size: 'A4', info: { Title: title, Creator: 'Kimi Agent' } });

        const stream = fs.createWriteStream(out);
        doc.pipe(stream);

        const rawText = fromHtml ? stripHtml(content) : content;
        const lines = rawText.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('# ') && !fromHtml) {
                doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111').text(trimmed.slice(2), { paragraphGap: 6 });
                doc.font('Helvetica').fontSize(12).fillColor('#222222');
            } else if (trimmed.startsWith('## ') && !fromHtml) {
                doc.moveDown(0.4).font('Helvetica-Bold').fontSize(16).fillColor('#222222').text(trimmed.slice(3), { paragraphGap: 4 });
                doc.font('Helvetica').fontSize(12).fillColor('#222222');
            } else if (trimmed.startsWith('### ') && !fromHtml) {
                doc.moveDown(0.3).font('Helvetica-Bold').fontSize(13).fillColor('#333333').text(trimmed.slice(4), { paragraphGap: 3 });
                doc.font('Helvetica').fontSize(12).fillColor('#222222');
            } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                doc.font('Helvetica').fontSize(12).fillColor('#222222')
                    .text('  •  ' + trimmed.slice(2), { indent: 20, paragraphGap: 2 });
            } else if (trimmed === '') {
                doc.moveDown(0.5);
            } else {
                doc.font('Helvetica').fontSize(12).fillColor('#222222').text(trimmed, { paragraphGap: 3, lineGap: 2 });
            }
        }

        doc.end();

        await new Promise<void>((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        });

        const size = fs.statSync(out).size;
        return { success: true, path: out, size, message: `PDF saved: ${out} (${(size / 1024).toFixed(1)} KB)` };
    } catch (e: any) {
        return { success: false, error: `PDF generation failed: ${e.message}` };
    }
}
