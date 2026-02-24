import axios from 'axios';

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface SearchResults {
    query: string;
    results: SearchResult[];
    error?: string;
}

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── DDG Instant Answers (fast, topic-based) ──────────────────────────────────
async function duckduckgoInstant(query: string): Promise<SearchResult[]> {
    const resp = await axios.get('https://api.duckduckgo.com/', {
        params: { q: query, format: 'json', no_html: '1', skip_disambig: '1', no_redirect: '1' },
        timeout: 8000,
        headers: { 'User-Agent': BROWSER_UA },
    });
    const data = resp.data;
    const results: SearchResult[] = [];

    if (data.AbstractText) {
        results.push({ title: data.AbstractSource || 'Summary', url: data.AbstractURL || '', snippet: data.AbstractText });
    }
    if (data.Answer) {
        results.push({ title: 'Direct Answer', url: '', snippet: data.Answer });
    }
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const t of data.RelatedTopics.slice(0, 6)) {
            if (t.Text && t.FirstURL) {
                results.push({ title: t.Text.split(' - ')[0]?.slice(0, 80) || t.FirstURL, url: t.FirstURL, snippet: t.Text });
            } else if (t.Topics && Array.isArray(t.Topics)) {
                for (const s of t.Topics.slice(0, 3)) {
                    if (s.Text && s.FirstURL) {
                        results.push({ title: s.Text.slice(0, 80), url: s.FirstURL, snippet: s.Text });
                    }
                }
            }
        }
    }
    return results;
}

// ─── Brave Search HTML scraper ────────────────────────────────────────────────
async function braveSearch(query: string): Promise<SearchResult[]> {
    const resp = await axios.get('https://search.brave.com/search', {
        params: { q: query, source: 'web' },
        timeout: 15000,
        headers: {
            'User-Agent': BROWSER_UA,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
        },
    });

    const html: string = resp.data as string;
    const results: SearchResult[] = [];

    // Extract unique external URLs
    const urlSet = new Set<string>();
    const urlMatches = html.matchAll(/href="(https?:\/\/(?!search\.brave|brave\.com)[^"]{10,200})"/g);
    const urls: string[] = [];
    for (const m of urlMatches) {
        const u = m[1].split('&')[0];
        if (!urlSet.has(u)) { urlSet.add(u); urls.push(u); }
        if (urls.length >= 15) break;
    }

    // Extract titles from result blocks
    const titleMatches = html.matchAll(/class="[^"]*title[^"]*"[^>]*>([^<]{10,150})</g);
    const titles: string[] = [];
    for (const m of titleMatches) {
        const t = m[1].trim();
        if (t.length > 5) titles.push(t);
        if (titles.length >= 10) break;
    }

    // Extract snippets — look for longer text spans after each result
    const snippetMatches = html.matchAll(/class="[^"]*(?:snippet|desc|body|abstract|summary)[^"]*"[^>]*>([\s\S]{20,500}?)<\/(?:p|div|span)>/g);
    const snippets: string[] = [];
    for (const m of snippetMatches) {
        const s = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (s.length > 20) snippets.push(s.slice(0, 300));
        if (snippets.length >= 10) break;
    }

    // Pair up urls + titles + snippets
    const count = Math.min(urls.length, titles.length, 8);
    for (let i = 0; i < count; i++) {
        results.push({
            url: urls[i],
            title: titles[i],
            snippet: snippets[i] || '',
        });
    }

    return results;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function webSearch(query: string): Promise<SearchResults> {
    try {
        // Try DDG instant first (good for factual / encyclopedia queries)
        let results = await duckduckgoInstant(query).catch(() => [] as SearchResult[]);

        // Always supplement / replace with Brave web results
        if (results.length < 3) {
            const brave = await braveSearch(query).catch(() => [] as SearchResult[]);
            results = [...results, ...brave];
        }

        // Deduplicate by URL
        const seen = new Set<string>();
        results = results.filter(r => {
            if (!r.url || seen.has(r.url)) return false;
            seen.add(r.url);
            return true;
        });

        if (results.length === 0) {
            results = [{
                title: 'No results found',
                url: '',
                snippet: `No web results found for "${query}". Try using the browser tool to open a specific URL directly.`,
            }];
        }

        return { query, results: results.slice(0, 8) };
    } catch (e: any) {
        return { query, results: [], error: `Search error: ${e.message}` };
    }
}
