import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

function resolveOut(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE, filePath);
}

export interface SpecializedResult {
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
}

// ─── Sports Data (ESPN public API, no key needed) ─────────────────────────────

const SPORTS_MAP: Record<string, { sport: string; league: string; name: string }> = {
    nba: { sport: 'basketball', league: 'nba', name: 'NBA' },
    nfl: { sport: 'football', league: 'nfl', name: 'NFL' },
    nhl: { sport: 'hockey', league: 'nhl', name: 'NHL' },
    mlb: { sport: 'baseball', league: 'mlb', name: 'MLB' },
    epl: { sport: 'soccer', league: 'eng.1', name: 'English Premier League' },
    premier_league: { sport: 'soccer', league: 'eng.1', name: 'English Premier League' },
    la_liga: { sport: 'soccer', league: 'esp.1', name: 'La Liga' },
    bundesliga: { sport: 'soccer', league: 'ger.1', name: 'Bundesliga' },
    serie_a: { sport: 'soccer', league: 'ita.1', name: 'Serie A' },
    ligue_1: { sport: 'soccer', league: 'fra.1', name: 'Ligue 1' },
    ucl: { sport: 'soccer', league: 'UEFA.CHAMPIONS', name: 'UEFA Champions League' },
    mls: { sport: 'soccer', league: 'usa.1', name: 'MLS' },
    wnba: { sport: 'basketball', league: 'wnba', name: 'WNBA' },
    f1: { sport: 'racing', league: 'f1', name: 'Formula 1' },
};

export async function fetchSportsData(
    league: string,
    type: 'scores' | 'standings' | 'news' | 'scoreboard' = 'scores'
): Promise<SpecializedResult> {
    const key = league.toLowerCase().replace(/\s+/g, '_');
    const sportInfo = SPORTS_MAP[key];

    if (!sportInfo) {
        const available = Object.keys(SPORTS_MAP).join(', ');
        return { success: false, error: `Unknown league "${league}". Available: ${available}` };
    }

    const { sport, league: leagueCode, name } = sportInfo;
    const baseUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${leagueCode}`;

    try {
        if (type === 'scores' || type === 'scoreboard') {
            const resp = await axios.get(`${baseUrl}/scoreboard`, { timeout: 10000 });
            const d = resp.data as any;
            const events = (d.events || []).map((e: any) => {
                const comp = e.competitions?.[0];
                const teams = comp?.competitors?.map((c: any) => ({
                    name: c.team?.displayName,
                    score: c.score,
                    is_winner: c.winner,
                    record: c.records?.[0]?.summary,
                })) || [];
                return {
                    game_id: e.id,
                    name: e.name,
                    date: e.date,
                    status: comp?.status?.type?.description || e.status?.type?.description,
                    teams,
                    venue: comp?.venue?.fullName,
                    broadcast: comp?.broadcasts?.[0]?.names?.join(', '),
                };
            });

            return {
                success: true,
                data: { league: name, week: d.week, games_count: events.length, games: events },
                message: `${name} scoreboard: ${events.length} games`,
            };
        }

        if (type === 'standings') {
            const resp = await axios.get(`${baseUrl}/standings`, { timeout: 10000 });
            const d = resp.data as any;
            const entries = (d.standings?.entries || []).map((e: any) => ({
                team: e.team?.displayName,
                abbrev: e.team?.abbreviation,
                stats: Object.fromEntries((e.stats || []).map((s: any) => [s.abbreviation || s.name, s.displayValue])),
            }));
            return {
                success: true,
                data: { league: name, standings: entries },
                message: `${name} standings: ${entries.length} teams`,
            };
        }

        if (type === 'news') {
            const resp = await axios.get(`${baseUrl}/news`, { timeout: 10000 });
            const d = resp.data as any;
            const articles = (d.articles || []).slice(0, 10).map((a: any) => ({
                headline: a.headline,
                description: a.description,
                published: a.published,
                link: a.links?.web?.href,
            }));
            return {
                success: true,
                data: { league: name, articles },
                message: `${name} news: ${articles.length} articles`,
            };
        }

        return { success: false, error: `Unknown type "${type}". Valid: scores, standings, news, scoreboard` };
    } catch (e: any) {
        return { success: false, error: `Sports data fetch failed: ${e.message}` };
    }
}

// ─── Message Compose ──────────────────────────────────────────────────────────

export function messageCompose(
    type: 'email' | 'slack' | 'sms' | 'whatsapp' | 'letter',
    params: {
        to?: string;
        from?: string;
        subject?: string;
        body: string;
        tone?: 'formal' | 'casual' | 'professional' | 'friendly';
        channel?: string;
        signature?: string;
    }
): SpecializedResult {
    const { to, from, subject, body, tone = 'professional', channel, signature } = params;

    let composed = '';

    switch (type) {
        case 'email': {
            const lines = [];
            if (subject) lines.push(`Subject: ${subject}`);
            if (to) lines.push(`To: ${to}`);
            if (from) lines.push(`From: ${from}`);
            lines.push('---');
            if (tone === 'formal') {
                lines.push(`Dear ${to || 'Sir/Madam'},\n`);
            } else if (tone === 'casual' || tone === 'friendly') {
                lines.push(`Hi ${to || 'there'},\n`);
            } else {
                lines.push(`Hello ${to || ''},\n`);
            }
            lines.push(body);
            lines.push('');
            if (tone === 'formal') {
                lines.push('Yours sincerely,');
            } else if (tone === 'casual') {
                lines.push('Cheers,');
            } else {
                lines.push('Best regards,');
            }
            if (signature || from) lines.push(signature || from || '');
            composed = lines.join('\n');
            break;
        }

        case 'slack': {
            const lines = [];
            if (channel) lines.push(`Channel: #${channel.replace('#', '')}`);
            lines.push('---');
            if (to) lines.push(`@${to.replace('@', '')}`);
            lines.push(body);
            composed = lines.join('\n');
            break;
        }

        case 'sms':
        case 'whatsapp': {
            const limit = type === 'sms' ? 160 : 2000;
            const truncated = body.length > limit ? body.slice(0, limit - 3) + '...' : body;
            composed = truncated;
            if (to) composed = `To: ${to}\n---\n` + composed;
            break;
        }

        case 'letter': {
            const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const lines = [];
            if (from) lines.push(`${from}\n`);
            lines.push(date + '\n');
            if (to) lines.push(`${to}\n`);
            if (subject) lines.push(`Re: ${subject}\n`);
            lines.push('---\n');
            lines.push(tone === 'formal' ? `Dear ${to || 'Sir/Madam'},\n` : `Dear ${to || 'friend'},\n`);
            lines.push(body + '\n');
            lines.push(tone === 'formal' ? 'Yours faithfully,' : 'Warm regards,');
            if (signature || from) lines.push('\n' + (signature || from || ''));
            composed = lines.join('\n');
            break;
        }
    }

    return {
        success: true,
        data: { type, tone, char_count: composed.length, message: composed },
        message: `${type.toUpperCase()} draft composed (${composed.length} chars, tone: ${tone})`,
    };
}

// ─── Recipe Display ───────────────────────────────────────────────────────────

export async function recipeDisplay(
    query: string,
    options: { servings?: number; filePath?: string; format?: 'html' | 'text' | 'json' } = {}
): Promise<SpecializedResult> {
    const { servings = 1, format = 'text' } = options;

    try {
        const resp = await axios.get(`https://www.themealdb.com/api/json/v1/1/search.php`, {
            params: { s: query },
            timeout: 10000,
        });

        const meals = (resp.data as any).meals;
        if (!meals || meals.length === 0) {
            return { success: false, error: `No recipe found for "${query}"` };
        }

        const meal = meals[0];
        const ingredients: Array<{ ingredient: string; measure: string }> = [];
        for (let i = 1; i <= 20; i++) {
            const ing = meal[`strIngredient${i}`];
            const meas = meal[`strMeasure${i}`];
            if (ing && ing.trim()) {
                ingredients.push({ ingredient: ing.trim(), measure: (meas || '').trim() });
            }
        }

        const recipe = {
            name: meal.strMeal,
            category: meal.strCategory,
            area: meal.strArea,
            tags: meal.strTags,
            youtube: meal.strYoutube,
            thumbnail: meal.strMealThumb,
            instructions: meal.strInstructions,
            ingredients,
            servings_original: 1,
            servings_requested: servings,
            source: meal.strSource,
        };

        if (format === 'html') {
            ensureWorkspace();
            const out = resolveOut(options.filePath || `recipe_${meal.strMeal.replace(/\s+/g, '_')}.html`);
            const ingList = ingredients.map(i => `<li><b>${i.measure}</b> ${i.ingredient}</li>`).join('\n');
            const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${meal.strMeal}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#333}
img{width:100%;max-height:400px;object-fit:cover;border-radius:12px}
h1{margin:1rem 0 0.25rem}
.meta{color:#888;font-size:0.9rem;margin-bottom:1rem}
.tag{background:#fff3e0;color:#e65100;padding:2px 8px;border-radius:4px;font-size:0.8rem}
h2{border-bottom:2px solid #ff7043;padding-bottom:4px;color:#e64a19}
ul{line-height:2}
.steps{counter-reset:step}
.step{counter-increment:step;display:flex;gap:12px;margin-bottom:16px}
.step::before{content:counter(step);background:#ff7043;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:bold;flex-shrink:0;font-size:14px}
a{color:#ff7043}
</style>
</head>
<body>
<img src="${meal.strMealThumb}" alt="${meal.strMeal}"/>
<h1>${meal.strMeal}</h1>
<p class="meta">
  ${meal.strCategory ? `<span class="tag">${meal.strCategory}</span>` : ''}
  ${meal.strArea ? `<span class="tag">${meal.strArea}</span>` : ''}
  ${meal.strTags ? meal.strTags.split(',').map((t: string) => `<span class="tag">${t.trim()}</span>`).join(' ') : ''}
  ${meal.strYoutube ? `| <a href="${meal.strYoutube}" target="_blank">Watch on YouTube</a>` : ''}
</p>
<h2>Ingredients (${servings} serving${servings > 1 ? 's' : ''})</h2>
<ul>${ingList}</ul>
<h2>Instructions</h2>
<div class="steps">
${meal.strInstructions.split(/\r?\n/).filter((s: string) => s.trim()).map((s: string) => `<div class="step"><span>${s}</span></div>`).join('\n')}
</div>
${meal.strSource ? `<p><small>Source: <a href="${meal.strSource}">${meal.strSource}</a></small></p>` : ''}
</body>
</html>`;
            fs.writeFileSync(out, html, 'utf8');
            return { success: true, data: { recipe, html_path: out }, message: `Recipe for "${meal.strMeal}" saved to ${out}` };
        }

        if (format === 'json') {
            return { success: true, data: recipe, message: `Recipe: ${meal.strMeal} (${ingredients.length} ingredients)` };
        }

        const text = [
            `🍳 ${meal.strMeal}`,
            `Category: ${meal.strCategory} | Cuisine: ${meal.strArea}`,
            ``,
            `INGREDIENTS (${servings} serving${servings > 1 ? 's' : ''}):`,
            ...ingredients.map(i => `  • ${i.measure} ${i.ingredient}`),
            ``,
            `INSTRUCTIONS:`,
            meal.strInstructions,
            meal.strYoutube ? `\nVideo: ${meal.strYoutube}` : '',
        ].join('\n');

        return { success: true, data: { recipe, text }, message: `Recipe: ${meal.strMeal} (${ingredients.length} ingredients)` };
    } catch (e: any) {
        return { success: false, error: `Recipe fetch failed: ${e.message}` };
    }
}

// ─── str_replace (targeted string replacement in file) ────────────────────────

export function strReplace(
    filePath: string,
    oldStr: string,
    newStr: string,
    occurrences: 'first' | 'all' = 'first'
): SpecializedResult {
    const full = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE, filePath);
    if (!fs.existsSync(full)) {
        return { success: false, error: `File not found: ${filePath}` };
    }

    try {
        let content = fs.readFileSync(full, 'utf8');
        const count = (content.split(oldStr).length - 1);

        if (count === 0) {
            return { success: false, error: `String not found in file: "${oldStr.slice(0, 60)}..."` };
        }

        if (occurrences === 'all') {
            content = content.split(oldStr).join(newStr);
        } else {
            content = content.replace(oldStr, newStr);
        }

        fs.writeFileSync(full, content, 'utf8');
        return {
            success: true,
            data: { file: filePath, occurrences_found: count, occurrences_replaced: occurrences === 'all' ? count : 1 },
            message: `Replaced ${occurrences === 'all' ? count : 1}/${count} occurrence(s) in ${filePath}`,
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── Present Files (list files for download with metadata) ───────────────────

export function presentFiles(
    dirPath = '.',
    recursive = false
): SpecializedResult {
    const full = path.isAbsolute(dirPath) ? dirPath : path.join(WORKSPACE, dirPath);
    if (!fs.existsSync(full)) {
        return { success: false, error: `Directory not found: ${dirPath}` };
    }

    function collectFiles(dir: string, base: string): any[] {
        const items: any[] = [];
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                const fullPath = path.join(dir, e.name);
                const relPath = path.relative(WORKSPACE, fullPath);
                if (e.isFile()) {
                    const stat = fs.statSync(fullPath);
                    const ext = path.extname(e.name).toLowerCase();
                    const typeMap: Record<string, string> = {
                        '.pdf': 'PDF', '.docx': 'Word', '.xlsx': 'Excel', '.pptx': 'PowerPoint',
                        '.html': 'HTML', '.md': 'Markdown', '.json': 'JSON', '.csv': 'CSV',
                        '.txt': 'Text', '.py': 'Python', '.js': 'JavaScript', '.ts': 'TypeScript',
                        '.zip': 'ZIP Archive', '.tar': 'TAR Archive', '.gz': 'GZ Archive',
                        '.png': 'Image', '.jpg': 'Image', '.jpeg': 'Image', '.svg': 'SVG',
                    };
                    items.push({
                        name: e.name,
                        path: relPath,
                        full_path: fullPath,
                        size_bytes: stat.size,
                        size_human: stat.size < 1024 ? `${stat.size}B` : stat.size < 1048576 ? `${(stat.size / 1024).toFixed(1)}KB` : `${(stat.size / 1048576).toFixed(1)}MB`,
                        type: typeMap[ext] || ext.slice(1).toUpperCase() || 'File',
                        modified: stat.mtime.toISOString().split('T')[0],
                        extension: ext,
                    });
                } else if (e.isDirectory() && recursive && !e.name.startsWith('.')) {
                    items.push(...collectFiles(fullPath, base));
                }
            }
        } catch {}
        return items;
    }

    const files = collectFiles(full, full);
    const totalSize = files.reduce((sum, f) => sum + f.size_bytes, 0);

    if (files.length === 0) {
        return { success: true, data: { files: [], total: 0 }, message: 'No files found' };
    }

    const summary = files.map(f =>
        `📄 ${f.name} [${f.type}] — ${f.size_human} — ${f.path}`
    ).join('\n');

    return {
        success: true,
        data: {
            files,
            total: files.length,
            total_size_bytes: totalSize,
            total_size_human: totalSize < 1048576 ? `${(totalSize / 1024).toFixed(1)}KB` : `${(totalSize / 1048576).toFixed(1)}MB`,
        },
        message: `${files.length} file(s) in ${dirPath}:\n${summary}`,
    };
}
