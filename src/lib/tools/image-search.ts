import axios from 'axios';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface ImageResult {
    title: string;
    image_url: string;
    thumbnail_url: string;
    source_url: string;
    width?: number;
    height?: number;
}

export interface ImageSearchResult {
    query: string;
    results: ImageResult[];
    error?: string;
}

async function getDDGVqd(query: string): Promise<string> {
    const resp = await axios.get('https://duckduckgo.com/', {
        params: { q: query, iax: 'images', ia: 'images' },
        headers: { 'User-Agent': UA, 'Accept': 'text/html' },
        timeout: 10000,
    });
    const html: string = resp.data as string;
    const match = html.match(/vqd=['"]([^'"]+)['"]/);
    if (match) return match[1];
    const match2 = html.match(/vqd=([0-9-]+)/);
    if (match2) return match2[1];
    throw new Error('Could not get DDG VQD token');
}

export async function searchImageByText(query: string, limit = 8): Promise<ImageSearchResult> {
    try {
        const vqd = await getDDGVqd(query);
        const resp = await axios.get('https://duckduckgo.com/i.js', {
            params: {
                l: 'us-en',
                o: 'json',
                q: query,
                vqd,
                f: ',,,,,',
                p: '1',
            },
            headers: {
                'User-Agent': UA,
                'Referer': 'https://duckduckgo.com/',
                'Accept': 'application/json',
            },
            timeout: 12000,
        });

        const data = resp.data as any;
        const results: ImageResult[] = [];

        if (data.results && Array.isArray(data.results)) {
            for (const item of data.results.slice(0, limit)) {
                results.push({
                    title: item.title || '',
                    image_url: item.image || '',
                    thumbnail_url: item.thumbnail || '',
                    source_url: item.url || '',
                    width: item.width,
                    height: item.height,
                });
            }
        }

        if (results.length === 0) {
            return { query, results: [], error: 'No image results found' };
        }

        return { query, results };
    } catch (e: any) {
        return { query, results: [], error: `Image search error: ${e.message}` };
    }
}

export async function searchImageByImage(imageUrl: string, limit = 6): Promise<ImageSearchResult> {
    try {
        const encodedUrl = encodeURIComponent(imageUrl);

        const resp = await axios.get('https://www.bing.com/images/search', {
            params: {
                view: 'detailv2',
                iss: 'sbi',
                form: 'SBIVSP',
                sbisrc: 'ImgPaste',
                imgurl: imageUrl,
            },
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.bing.com/',
            },
            timeout: 15000,
        });

        const html: string = resp.data as string;
        const results: ImageResult[] = [];
        const seen = new Set<string>();

        const imgMatches = html.matchAll(/"murl":"([^"]+)","turl":"([^"]+)"[^}]*?"t":"([^"]+)"/g);
        for (const m of imgMatches) {
            const imgUrl = m[1];
            if (seen.has(imgUrl)) continue;
            seen.add(imgUrl);
            results.push({
                title: m[3] || 'Similar image',
                image_url: imgUrl,
                thumbnail_url: m[2] || '',
                source_url: '',
            });
            if (results.length >= limit) break;
        }

        if (results.length === 0) {
            return {
                query: imageUrl,
                results: [],
                error: 'No similar images found via reverse search. Try search_image_by_text with a description instead.',
            };
        }

        return { query: imageUrl, results };
    } catch (e: any) {
        return { query: imageUrl, results: [], error: `Reverse image search error: ${e.message}` };
    }
}
