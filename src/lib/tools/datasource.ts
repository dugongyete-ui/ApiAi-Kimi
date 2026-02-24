import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const YF_HEADERS = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
};

export type DataSourceName = 'yahoo_finance' | 'binance_crypto' | 'world_bank_open_data' | 'arxiv' | 'google_scholar';

export interface DataSourceResult {
    source: string;
    data: any;
    error?: string;
}

// ─── Data source descriptions ─────────────────────────────────────────────────
const DATASOURCE_DESCRIPTIONS: Record<DataSourceName, object> = {
    yahoo_finance: {
        name: 'yahoo_finance',
        description: 'Real-time and historical stock, ETF, crypto, indices, and financial data from Yahoo Finance',
        params: {
            query: 'Stock ticker symbol or search term (e.g. "TSLA", "BTC-USD", "^GSPC")',
            type: 'One of: quote | history | financials | news | search | options',
            period: '(for history) e.g. 1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max',
            interval: '(for history) e.g. 1m, 5m, 15m, 1h, 1d, 1wk, 1mo',
        },
        examples: [
            { query: 'TSLA', type: 'quote' },
            { query: 'TSLA', type: 'history', period: '1mo', interval: '1d' },
            { query: 'BTC-USD', type: 'quote' },
            { query: 'Apple', type: 'search' },
            { query: 'AAPL', type: 'news' },
        ],
    },
    binance_crypto: {
        name: 'binance_crypto',
        description: 'Real-time cryptocurrency data from Binance — prices, 24h stats, historical candlestick (K-line) data',
        params: {
            query: 'Crypto pair symbol (e.g. "BTCUSDT", "ETHUSDT") or "ALL" for top coins',
            type: 'One of: price | ticker24h | klines | depth | trades | exchange_info',
            interval: '(for klines) e.g. 1m, 5m, 15m, 1h, 4h, 1d, 1w',
            limit: '(for klines/trades) number of data points, max 1000',
        },
        examples: [
            { query: 'BTCUSDT', type: 'price' },
            { query: 'ETHUSDT', type: 'ticker24h' },
            { query: 'BTCUSDT', type: 'klines', interval: '1h', limit: 24 },
            { query: 'ALL', type: 'price' },
        ],
    },
    world_bank_open_data: {
        name: 'world_bank_open_data',
        description: 'Global economic and development data from World Bank (1960–present). GDP, population, poverty, inflation, trade, education, health, environment.',
        params: {
            query: 'Country code (e.g. "ID", "US", "CN", "all") or indicator code',
            indicator: 'World Bank indicator code. Common ones: NY.GDP.MKTP.CD (GDP), SP.POP.TOTL (Population), FP.CPI.TOTL.ZG (Inflation), SI.POV.NAHC (Poverty rate), SL.UEM.TOTL.ZS (Unemployment), NE.EXP.GNFS.ZS (Exports % GDP)',
            type: 'One of: indicator | country | search_indicators',
            date_range: 'e.g. "2010:2023" or "2023" (optional)',
        },
        examples: [
            { query: 'ID', indicator: 'NY.GDP.MKTP.CD', type: 'indicator' },
            { query: 'all', indicator: 'SP.POP.TOTL', type: 'indicator', date_range: '2020:2023' },
            { query: 'GDP inflation', type: 'search_indicators' },
            { query: 'ID', type: 'country' },
        ],
    },
    arxiv: {
        name: 'arxiv',
        description: 'Scientific preprint papers from arXiv.org. Search across physics, mathematics, computer science, biology, economics, statistics.',
        params: {
            query: 'Search query string',
            type: 'One of: search | paper',
            paper_id: '(for type:paper) arXiv paper ID e.g. "2401.12345"',
            category: 'Filter by category (optional): cs.AI, cs.LG, cs.CV, math.ST, quant-ph, etc.',
            max_results: 'Number of results, default 5, max 20',
            sort_by: 'submittedDate | relevance | lastUpdatedDate',
        },
        examples: [
            { query: 'large language models 2024', type: 'search', max_results: 5 },
            { query: 'quantum computing', type: 'search', category: 'quant-ph', sort_by: 'submittedDate' },
            { paper_id: '2401.12345', type: 'paper' },
        ],
    },
    google_scholar: {
        name: 'google_scholar',
        description: 'Academic literature search via Semantic Scholar API (free, no key needed). Find papers, authors, citations, h-index.',
        params: {
            query: 'Search query or author name',
            type: 'One of: search | paper | author',
            paper_id: '(for type:paper) Semantic Scholar paper ID',
            author_id: '(for type:author) Semantic Scholar author ID',
            fields: 'Fields to return (optional)',
            limit: 'Number of results, default 10, max 100',
            year: 'Filter by year e.g. "2020-2024" or "2023"',
        },
        examples: [
            { query: 'transformer attention mechanism', type: 'search', limit: 5 },
            { query: 'Yann LeCun', type: 'author' },
            { query: 'attention is all you need', type: 'search', year: '2017' },
        ],
    },
};

// ─── Yahoo Finance ─────────────────────────────────────────────────────────────
async function yahooFinance(params: Record<string, any>): Promise<DataSourceResult> {
    const { query = '', type = 'quote', period = '1mo', interval = '1d' } = params;

    try {
        if (type === 'search') {
            const resp = await axios.get(`https://query2.finance.yahoo.com/v1/finance/search`, {
                params: { q: query, lang: 'en-US', region: 'US', quotesCount: 6, newsCount: 0 },
                headers: YF_HEADERS,
                timeout: 10000,
            });
            return { source: 'yahoo_finance', data: resp.data?.quotes || [] };
        }

        if (type === 'quote') {
            const resp = await axios.get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(query)}`, {
                params: { interval: '1d', range: '1d', includePrePost: 'false' },
                headers: YF_HEADERS,
                timeout: 10000,
            });
            const meta = resp.data?.chart?.result?.[0]?.meta;
            if (!meta) return { source: 'yahoo_finance', data: null, error: 'Symbol not found' };
            return {
                source: 'yahoo_finance',
                data: {
                    symbol: meta.symbol,
                    currency: meta.currency,
                    exchange: meta.exchangeName,
                    current_price: meta.regularMarketPrice,
                    previous_close: meta.chartPreviousClose,
                    change: +(meta.regularMarketPrice - meta.chartPreviousClose).toFixed(4),
                    change_pct: +(((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100).toFixed(2),
                    day_high: meta.regularMarketDayHigh,
                    day_low: meta.regularMarketDayLow,
                    volume: meta.regularMarketVolume,
                    market_cap: meta.marketCap,
                    type: meta.instrumentType,
                    timezone: meta.timezone,
                },
            };
        }

        if (type === 'history') {
            const resp = await axios.get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(query)}`, {
                params: { interval, range: period, includePrePost: 'false' },
                headers: YF_HEADERS,
                timeout: 12000,
            });
            const result = resp.data?.chart?.result?.[0];
            if (!result) return { source: 'yahoo_finance', data: null, error: 'No data' };
            const timestamps = result.timestamp || [];
            const closes = result.indicators?.quote?.[0]?.close || [];
            const opens = result.indicators?.quote?.[0]?.open || [];
            const highs = result.indicators?.quote?.[0]?.high || [];
            const lows = result.indicators?.quote?.[0]?.low || [];
            const volumes = result.indicators?.quote?.[0]?.volume || [];
            const rows = timestamps.map((ts: number, i: number) => ({
                date: new Date(ts * 1000).toISOString().split('T')[0],
                open: opens[i] ? +opens[i].toFixed(4) : null,
                high: highs[i] ? +highs[i].toFixed(4) : null,
                low: lows[i] ? +lows[i].toFixed(4) : null,
                close: closes[i] ? +closes[i].toFixed(4) : null,
                volume: volumes[i] || null,
            }));
            return {
                source: 'yahoo_finance',
                data: {
                    symbol: result.meta?.symbol,
                    currency: result.meta?.currency,
                    interval,
                    period,
                    rows: rows.slice(-100),
                },
            };
        }

        if (type === 'news') {
            const resp = await axios.get(`https://query2.finance.yahoo.com/v1/finance/search`, {
                params: { q: query, lang: 'en-US', region: 'US', quotesCount: 0, newsCount: 8 },
                headers: YF_HEADERS,
                timeout: 10000,
            });
            return { source: 'yahoo_finance', data: resp.data?.news || [] };
        }

        return { source: 'yahoo_finance', data: null, error: `Unknown type: ${type}` };
    } catch (e: any) {
        return { source: 'yahoo_finance', data: null, error: e.message };
    }
}

// ─── Binance Crypto ───────────────────────────────────────────────────────────
// CoinGecko coin ID map for common symbols
const COINGECKO_IDS: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
    XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', MATIC: 'matic-network',
    DOT: 'polkadot', LTC: 'litecoin', AVAX: 'avalanche-2', LINK: 'chainlink',
    UNI: 'uniswap', ATOM: 'cosmos', TON: 'the-open-network', SHIB: 'shiba-inu',
    TRX: 'tron', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism',
    SUI: 'sui', PEPE: 'pepe', FLOKI: 'floki', INJ: 'injective-protocol',
};

function resolveCoingeckoId(symbol: string): string {
    const sym = symbol.toUpperCase().replace(/USDT$|USD$|-USD$/, '').trim();
    return COINGECKO_IDS[sym] || sym.toLowerCase();
}

const CG_BASE = 'https://api.coingecko.com/api/v3';

async function binanceCrypto(params: Record<string, any>): Promise<DataSourceResult> {
    const { query = 'BTCUSDT', type = 'price', interval = '1h', limit = 24 } = params;

    try {
        // Map interval to CoinGecko days param
        const intervalToDays: Record<string, number> = {
            '1m': 1, '5m': 1, '15m': 1, '30m': 1,
            '1h': 2, '4h': 7, '1d': 30, '1w': 365, '1M': 365,
        };

        if (type === 'price') {
            if (String(query).toUpperCase() === 'ALL') {
                const resp = await axios.get(`${CG_BASE}/coins/markets`, {
                    params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 20, page: 1, sparkline: false },
                    headers: { 'User-Agent': UA },
                    timeout: 10000,
                });
                const top = (resp.data as any[]).map((c: any) => ({
                    symbol: c.symbol?.toUpperCase() + 'USDT',
                    name: c.name,
                    price: c.current_price,
                    change_24h_pct: c.price_change_percentage_24h?.toFixed(2),
                    market_cap: c.market_cap,
                    rank: c.market_cap_rank,
                }));
                return { source: 'binance_crypto', data: top };
            }
            const coinId = resolveCoingeckoId(String(query));
            const resp = await axios.get(`${CG_BASE}/simple/price`, {
                params: { ids: coinId, vs_currencies: 'usd', include_24hr_change: true, include_market_cap: true, include_24hr_vol: true },
                headers: { 'User-Agent': UA },
                timeout: 8000,
            });
            const d = resp.data?.[coinId];
            if (!d) return { source: 'binance_crypto', data: null, error: `Coin not found: ${query} (tried id: ${coinId})` };
            return {
                source: 'binance_crypto',
                data: {
                    symbol: String(query).toUpperCase(),
                    coin_id: coinId,
                    price_usd: d.usd,
                    change_24h_pct: d.usd_24h_change?.toFixed(2),
                    market_cap_usd: d.usd_market_cap,
                    volume_24h_usd: d.usd_24h_vol,
                },
            };
        }

        if (type === 'ticker24h') {
            const coinId = resolveCoingeckoId(String(query));
            const resp = await axios.get(`${CG_BASE}/coins/${coinId}`, {
                params: { localization: false, tickers: false, community_data: false, developer_data: false },
                headers: { 'User-Agent': UA },
                timeout: 10000,
            });
            const d = resp.data as any;
            const mkt = d.market_data || {};
            return {
                source: 'binance_crypto',
                data: {
                    symbol: String(query).toUpperCase(),
                    name: d.name,
                    coin_id: coinId,
                    price_usd: mkt.current_price?.usd,
                    change_24h_pct: mkt.price_change_percentage_24h?.toFixed(2),
                    change_7d_pct: mkt.price_change_percentage_7d?.toFixed(2),
                    high_24h: mkt.high_24h?.usd,
                    low_24h: mkt.low_24h?.usd,
                    market_cap_usd: mkt.market_cap?.usd,
                    volume_24h_usd: mkt.total_volume?.usd,
                    circulating_supply: mkt.circulating_supply,
                    total_supply: mkt.total_supply,
                    ath: mkt.ath?.usd,
                    atl: mkt.atl?.usd,
                    market_cap_rank: d.market_cap_rank,
                    last_updated: d.last_updated,
                },
            };
        }

        if (type === 'klines') {
            const coinId = resolveCoingeckoId(String(query));
            const days = intervalToDays[interval] || 30;
            const resp = await axios.get(`${CG_BASE}/coins/${coinId}/ohlc`, {
                params: { vs_currency: 'usd', days },
                headers: { 'User-Agent': UA },
                timeout: 12000,
            });
            const klines = (resp.data as any[]).map((k: any) => ({
                time: new Date(k[0]).toISOString(),
                open: k[1],
                high: k[2],
                low: k[3],
                close: k[4],
            })).slice(-Math.min(Number(limit), 200));
            return { source: 'binance_crypto', data: { symbol: query, coin_id: coinId, interval, klines } };
        }

        if (type === 'top_coins' || type === 'exchange_info') {
            const resp = await axios.get(`${CG_BASE}/coins/markets`, {
                params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 50, page: 1 },
                headers: { 'User-Agent': UA },
                timeout: 10000,
            });
            return { source: 'binance_crypto', data: resp.data };
        }

        return { source: 'binance_crypto', data: null, error: `Unknown type: ${type}. Use: price | ticker24h | klines | top_coins` };
    } catch (e: any) {
        return { source: 'binance_crypto', data: null, error: e.message };
    }
}

// ─── World Bank Open Data ─────────────────────────────────────────────────────
async function worldBankData(params: Record<string, any>): Promise<DataSourceResult> {
    const { query = 'all', indicator = 'NY.GDP.MKTP.CD', type = 'indicator', date_range = '' } = params;
    const BASE = 'https://api.worldbank.org/v2';

    try {
        if (type === 'search_indicators') {
            const resp = await axios.get(`${BASE}/indicator`, {
                params: { format: 'json', per_page: 20, source: 2, q: query },
                timeout: 10000,
            });
            const items = (resp.data as any[])[1] || [];
            return {
                source: 'world_bank_open_data',
                data: items.map((i: any) => ({
                    id: i.id,
                    name: i.name,
                    source: i.source?.value,
                    topics: i.topics?.map((t: any) => t.value).join(', '),
                })),
            };
        }

        if (type === 'country') {
            const resp = await axios.get(`${BASE}/country/${query}`, {
                params: { format: 'json', per_page: 50 },
                timeout: 10000,
            });
            return { source: 'world_bank_open_data', data: (resp.data as any[])[1] || [] };
        }

        if (type === 'indicator') {
            const countryCode = String(query).toLowerCase() === 'all' ? 'all' : query;
            const reqParams: any = { format: 'json', per_page: 100, mrv: 10 };
            if (date_range) reqParams.date = date_range;
            const resp = await axios.get(`${BASE}/country/${countryCode}/indicator/${indicator}`, {
                params: reqParams,
                timeout: 12000,
            });
            const raw = (resp.data as any[])[1] || [];
            const data = raw
                .filter((r: any) => r.value !== null)
                .map((r: any) => ({
                    country: r.country?.value,
                    country_code: r.countryiso3code,
                    year: r.date,
                    value: r.value,
                    unit: r.unit,
                }))
                .sort((a: any, b: any) => b.year - a.year);
            return { source: 'world_bank_open_data', data: { indicator, rows: data.slice(0, 80) } };
        }

        return { source: 'world_bank_open_data', data: null, error: `Unknown type: ${type}` };
    } catch (e: any) {
        return { source: 'world_bank_open_data', data: null, error: e.message };
    }
}

// ─── arXiv ────────────────────────────────────────────────────────────────────
async function arxivData(params: Record<string, any>): Promise<DataSourceResult> {
    const { query = '', type = 'search', paper_id = '', category = '', max_results = 5, sort_by = 'relevance' } = params;

    try {
        if (type === 'paper' && paper_id) {
            const resp = await axios.get('https://export.arxiv.org/api/query', {
                params: { id_list: paper_id, max_results: 1 },
                headers: { 'User-Agent': UA },
                timeout: 12000,
                responseType: 'text',
            });
            return { source: 'arxiv', data: parseArxivXml(resp.data as string).slice(0, 1) };
        }

        let searchQuery = query;
        if (category) searchQuery = `cat:${category} AND ${searchQuery}`;

        const sortMap: Record<string, string> = {
            relevance: 'relevance',
            submittedDate: 'submittedDate',
            lastUpdatedDate: 'lastUpdatedDate',
        };

        const resp = await axios.get('https://export.arxiv.org/api/query', {
            params: {
                search_query: `all:${searchQuery}`,
                start: 0,
                max_results: Math.min(Number(max_results), 20),
                sortBy: sortMap[sort_by] || 'relevance',
                sortOrder: 'descending',
            },
            headers: { 'User-Agent': UA },
            timeout: 15000,
            responseType: 'text',
        });

        const papers = parseArxivXml(resp.data as string);
        return { source: 'arxiv', data: papers };
    } catch (e: any) {
        return { source: 'arxiv', data: null, error: e.message };
    }
}

function parseArxivXml(xml: string): any[] {
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    return entries.map(entry => {
        const get = (tag: string) => {
            const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
            return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
        };
        const id_raw = get('id');
        const paper_id = id_raw.match(/abs\/([^v]+)/)?.[1] || id_raw;
        const authors = entry.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/g)?.map(a => {
            const n = a.match(/<name>([^<]+)<\/name>/);
            return n ? n[1] : '';
        }) || [];
        const categories = entry.match(/term="([^"]+)"/g)?.map(t => t.match(/term="([^"]+)"/)?.[1] || '') || [];
        return {
            id: paper_id,
            title: get('title'),
            summary: get('summary').slice(0, 600),
            authors: authors.slice(0, 5),
            published: get('published')?.split('T')[0],
            updated: get('updated')?.split('T')[0],
            categories: categories.slice(0, 5),
            url: `https://arxiv.org/abs/${paper_id}`,
            pdf_url: `https://arxiv.org/pdf/${paper_id}`,
        };
    });
}

// ─── OpenAlex (Google Scholar equivalent — free, no API key required) ─────────
async function semanticScholar(params: Record<string, any>): Promise<DataSourceResult> {
    const { query = '', type = 'search', paper_id = '', author_id = '', limit = 10, year = '' } = params;
    const OA_BASE = 'https://api.openalex.org';
    const email = 'agent@example.com'; // polite pool for better rate limits

    try {
        if (type === 'paper' && paper_id) {
            const workId = paper_id.startsWith('W') ? paper_id : `W${paper_id}`;
            const resp = await axios.get(`${OA_BASE}/works/${workId}`, {
                params: { mailto: email },
                headers: { 'User-Agent': UA },
                timeout: 10000,
            });
            const w = resp.data as any;
            return {
                source: 'google_scholar',
                data: {
                    id: w.id,
                    title: w.title,
                    abstract: w.abstract,
                    year: w.publication_year,
                    cited_by_count: w.cited_by_count,
                    doi: w.doi,
                    authors: (w.authorships || []).slice(0, 5).map((a: any) => a.author?.display_name),
                    open_access: w.open_access?.is_oa,
                    pdf_url: w.open_access?.oa_url,
                    url: w.id,
                },
            };
        }

        if (type === 'author') {
            const searchTarget = author_id
                ? `${OA_BASE}/authors/${author_id}`
                : `${OA_BASE}/authors`;
            const searchParams: any = { mailto: email };
            if (!author_id) searchParams.search = query;
            const resp = await axios.get(searchTarget, {
                params: searchParams,
                headers: { 'User-Agent': UA },
                timeout: 10000,
            });
            if (author_id) {
                const a = resp.data as any;
                return {
                    source: 'google_scholar',
                    data: {
                        id: a.id,
                        name: a.display_name,
                        affiliations: (a.affiliations || []).map((af: any) => af.institution?.display_name).slice(0, 3),
                        works_count: a.works_count,
                        cited_by_count: a.cited_by_count,
                        h_index: a.summary_stats?.h_index,
                        i10_index: a.summary_stats?.i10_index,
                        orcid: a.orcid,
                    },
                };
            }
            const authors = ((resp.data as any).results || []).slice(0, Math.min(Number(limit), 10));
            return {
                source: 'google_scholar',
                data: authors.map((a: any) => ({
                    id: a.id,
                    name: a.display_name,
                    affiliation: a.last_known_institutions?.[0]?.display_name,
                    works_count: a.works_count,
                    cited_by_count: a.cited_by_count,
                    h_index: a.summary_stats?.h_index,
                })),
            };
        }

        // Default: search papers
        const searchParams: any = {
            search: query,
            'per-page': Math.min(Number(limit), 50),
            select: 'id,title,publication_year,cited_by_count,open_access,authorships,primary_location,abstract_inverted_index,doi',
            mailto: email,
        };
        if (year) {
            // year can be "2020-2024" or "2023"
            if (year.includes('-')) {
                const [from, to] = year.split('-');
                searchParams.filter = `publication_year:>${parseInt(from) - 1},publication_year:<${parseInt(to) + 1}`;
            } else {
                searchParams.filter = `publication_year:${year}`;
            }
        }
        const resp = await axios.get(`${OA_BASE}/works`, {
            params: searchParams,
            headers: { 'User-Agent': UA },
            timeout: 15000,
        });
        const works = (resp.data as any).results || [];
        const total = (resp.data as any).meta?.count || 0;

        const formatted = works.map((w: any) => ({
            id: w.id,
            title: w.title,
            year: w.publication_year,
            cited_by_count: w.cited_by_count,
            open_access: w.open_access?.is_oa,
            pdf_url: w.open_access?.oa_url,
            doi: w.doi,
            authors: (w.authorships || []).slice(0, 4).map((a: any) => a.author?.display_name),
            venue: w.primary_location?.source?.display_name,
        }));

        return { source: 'google_scholar', data: { total_results: total, papers: formatted } };
    } catch (e: any) {
        return { source: 'google_scholar', data: null, error: e.message };
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getDataSourceDesc(source?: string): object {
    if (source && source in DATASOURCE_DESCRIPTIONS) {
        return DATASOURCE_DESCRIPTIONS[source as DataSourceName];
    }
    return {
        available_sources: Object.keys(DATASOURCE_DESCRIPTIONS),
        descriptions: Object.fromEntries(
            Object.entries(DATASOURCE_DESCRIPTIONS).map(([k, v]) => [k, (v as any).description])
        ),
        usage: 'Call get_datasource_desc with a specific source name to see detailed params and examples',
    };
}

export async function getDataSource(source: string, params: Record<string, any>): Promise<DataSourceResult> {
    switch (source) {
        case 'yahoo_finance':      return yahooFinance(params);
        case 'binance_crypto':     return binanceCrypto(params);
        case 'world_bank_open_data': return worldBankData(params);
        case 'arxiv':              return arxivData(params);
        case 'google_scholar':     return semanticScholar(params);
        default:
            return {
                source,
                data: null,
                error: `Unknown source: "${source}". Available: yahoo_finance, binance_crypto, world_bank_open_data, arxiv, google_scholar`,
            };
    }
}
