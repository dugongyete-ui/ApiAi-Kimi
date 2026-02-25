import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

function resolveOut(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE, filePath);
}

export interface OfficeResult {
    success: boolean;
    path?: string;
    size?: number;
    error?: string;
    message?: string;
}

// ─── Word Document (.docx) ────────────────────────────────────────────────────

export async function generateDocx(
    content: {
        title?: string;
        sections: Array<{
            heading?: string;
            heading_level?: 1 | 2 | 3;
            paragraphs?: string[];
            table?: { headers: string[]; rows: string[][] };
            bullet_list?: string[];
        }>;
    },
    filePath = 'output.docx'
): Promise<OfficeResult> {
    ensureWorkspace();
    const out = resolveOut(filePath.endsWith('.docx') ? filePath : filePath + '.docx');
    const dir = path.dirname(out);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
        const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
            BorderStyle, WidthType, AlignmentType, Packer } = await import('docx');

        const children: any[] = [];

        if (content.title) {
            children.push(new Paragraph({
                text: content.title,
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
            }));
        }

        const headingMap: Record<number, any> = {
            1: HeadingLevel.HEADING_1,
            2: HeadingLevel.HEADING_2,
            3: HeadingLevel.HEADING_3,
        };

        for (const section of content.sections) {
            if (section.heading) {
                children.push(new Paragraph({
                    text: section.heading,
                    heading: headingMap[section.heading_level || 1],
                    spacing: { before: 240, after: 120 },
                }));
            }

            if (section.paragraphs) {
                for (const para of section.paragraphs) {
                    children.push(new Paragraph({
                        children: [new TextRun({ text: para, size: 24 })],
                        spacing: { after: 160 },
                    }));
                }
            }

            if (section.bullet_list) {
                for (const item of section.bullet_list) {
                    children.push(new Paragraph({
                        children: [new TextRun({ text: item })],
                        bullet: { level: 0 },
                        spacing: { after: 80 },
                    }));
                }
            }

            if (section.table) {
                const { headers, rows } = section.table;
                const tableRows: any[] = [];

                tableRows.push(new TableRow({
                    children: headers.map(h => new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                        shading: { fill: 'E0E0E0' },
                    })),
                    tableHeader: true,
                }));

                for (const row of rows) {
                    tableRows.push(new TableRow({
                        children: row.map(cell => new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: String(cell) })] })],
                        })),
                    }));
                }

                children.push(new Table({
                    rows: tableRows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                }));

                children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
            }
        }

        const doc = new Document({ sections: [{ children }] });
        const buf = await Packer.toBuffer(doc);
        fs.writeFileSync(out, buf);

        return { success: true, path: out, size: buf.length, message: `Word document saved: ${out} (${(buf.length / 1024).toFixed(1)} KB)` };
    } catch (e: any) {
        return { success: false, error: `DOCX generation failed: ${e.message}` };
    }
}

// ─── Excel Spreadsheet (.xlsx) ────────────────────────────────────────────────

export async function generateXlsx(
    sheets: Array<{
        name: string;
        headers?: string[];
        rows: (string | number | null)[][];
        column_widths?: number[];
    }>,
    filePath = 'output.xlsx'
): Promise<OfficeResult> {
    ensureWorkspace();
    const out = resolveOut(filePath.endsWith('.xlsx') ? filePath : filePath + '.xlsx');
    const dir = path.dirname(out);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Kimi Agent';
        wb.created = new Date();

        for (const sheetData of sheets) {
            const ws = wb.addWorksheet(sheetData.name || 'Sheet1');

            if (sheetData.headers && sheetData.headers.length > 0) {
                const headerRow = ws.addRow(sheetData.headers);
                headerRow.eachCell(cell => {
                    cell.font = { bold: true, size: 11 };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
                    cell.border = {
                        bottom: { style: 'medium', color: { argb: 'FF4472C4' } },
                    };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                });
                ws.autoFilter = {
                    from: { row: 1, column: 1 },
                    to: { row: 1, column: sheetData.headers.length },
                };
            }

            for (const row of sheetData.rows) {
                ws.addRow(row.map(v => v === null ? '' : v));
            }

            if (sheetData.column_widths) {
                sheetData.column_widths.forEach((w, i) => {
                    if (ws.columns[i]) ws.columns[i].width = w;
                });
            } else {
                ws.columns.forEach(col => { col.width = 18; });
            }
        }

        const buf = await wb.xlsx.writeBuffer() as Buffer;
        fs.writeFileSync(out, buf);

        return { success: true, path: out, size: buf.length, message: `Excel saved: ${out} (${(buf.length / 1024).toFixed(1)} KB, ${sheets.length} sheets)` };
    } catch (e: any) {
        return { success: false, error: `XLSX generation failed: ${e.message}` };
    }
}

// ─── PowerPoint Presentation (.pptx) ─────────────────────────────────────────

export async function generatePptx(
    slides: Array<{
        title: string;
        subtitle?: string;
        content?: string[];
        bullet_points?: string[];
        table?: { headers: string[]; rows: string[][] };
        layout?: 'title' | 'content' | 'two_column' | 'blank';
    }>,
    filePath = 'output.pptx',
    theme?: { accent?: string; background?: string }
): Promise<OfficeResult> {
    ensureWorkspace();
    const out = resolveOut(filePath.endsWith('.pptx') ? filePath : filePath + '.pptx');
    const dir = path.dirname(out);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
        const pptxgen = (await import('pptxgenjs')).default;
        const prs = new pptxgen();

        prs.layout = 'LAYOUT_WIDE';
        prs.author = 'Kimi Agent';

        const accent = (theme?.accent || '2E75B6').replace('#', '');
        const bg = theme?.background || 'FFFFFF';

        for (let i = 0; i < slides.length; i++) {
            const s = slides[i];
            const slide = prs.addSlide();

            slide.background = { color: bg };

            const isTitle = i === 0 || s.layout === 'title';

            if (isTitle) {
                slide.addShape(prs.ShapeType.rect, {
                    x: 0, y: 0, w: '100%', h: 1.2,
                    fill: { color: accent },
                });
                slide.addText(s.title, {
                    x: 0.5, y: 0.15, w: '90%', h: 0.9,
                    fontSize: 32, bold: true, color: 'FFFFFF', valign: 'middle',
                });
                if (s.subtitle) {
                    slide.addText(s.subtitle, {
                        x: 0.5, y: 1.5, w: '90%', h: 1.2,
                        fontSize: 20, color: '555555', align: 'center',
                    });
                }
            } else {
                slide.addShape(prs.ShapeType.rect, {
                    x: 0, y: 0, w: '100%', h: 0.9,
                    fill: { color: accent },
                });
                slide.addText(s.title, {
                    x: 0.5, y: 0.08, w: '90%', h: 0.75,
                    fontSize: 24, bold: true, color: 'FFFFFF', valign: 'middle',
                });
            }

            let yPos = isTitle ? 3.0 : 1.1;

            if (s.content) {
                for (const line of s.content) {
                    slide.addText(line, {
                        x: 0.5, y: yPos, w: '90%', h: 0.5,
                        fontSize: 16, color: '333333',
                    });
                    yPos += 0.55;
                }
            }

            if (s.bullet_points) {
                const bulletText = s.bullet_points.map(b => ({ text: b, options: { bullet: { indent: 15 }, breakLine: true } }));
                slide.addText(bulletText as any, {
                    x: 0.5, y: yPos, w: '90%', h: (s.bullet_points.length * 0.5),
                    fontSize: 16, color: '222222',
                });
                yPos += s.bullet_points.length * 0.5 + 0.2;
            }

            if (s.table) {
                const { headers, rows } = s.table;
                const tableData = [
                    headers.map(h => ({ text: h, options: { bold: true, fill: accent, color: 'FFFFFF' } })),
                    ...rows.map((row, ri) => row.map(cell => ({
                        text: String(cell),
                        options: { fill: ri % 2 === 0 ? 'F2F2F2' : 'FFFFFF' },
                    }))),
                ];
                slide.addTable(tableData as any, {
                    x: 0.5, y: yPos, w: 9,
                    fontSize: 13, border: { pt: 1, color: 'CCCCCC' },
                });
            }

            slide.addText(`${i + 1}`, {
                x: '90%', y: '93%', w: '8%', h: 0.3,
                fontSize: 11, color: '999999', align: 'right',
            });
        }

        await prs.writeFile({ fileName: out });

        const size = fs.statSync(out).size;
        return { success: true, path: out, size, message: `PowerPoint saved: ${out} (${(size / 1024).toFixed(1)} KB, ${slides.length} slides)` };
    } catch (e: any) {
        return { success: false, error: `PPTX generation failed: ${e.message}` };
    }
}
