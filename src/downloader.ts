//================
import axios, { type AxiosRequestConfig } from 'axios';
//================
export interface DownloadResult {
title: string;
downloadURL: string;
format: string;
}
//================
interface ProviderDomain {
baseURL: string;
apiURL: string;
}
//================
const DOMAINS: ProviderDomain[] = [
{ baseURL: 'https://ytmp3.gl/', apiURL: 'https://gamma.gammacloud.net' },
{ baseURL: 'https://convertytmp3.org/', apiURL: 'https://epsilon.epsiloncloud.org' },
];
//================
export function getYouTubeVideoId(url: string): string | null {
if (!url || typeof url !== 'string' || url.length > 2048) return null;
try {
const parsed = new URL(url.trim());
const host = parsed.hostname.toLowerCase();
const allowed = [
'youtube.com',
'www.youtube.com',
'm.youtube.com',
'music.youtube.com',
'youtu.be',
'www.youtu.be',
'youtube-nocookie.com',
'www.youtube-nocookie.com',
];
if (!['http:', 'https:'].includes(parsed.protocol) || !allowed.some(h => host === h || host.endsWith('.' + h))) {
return null;
}
let videoId: string | null = null;
if (host.includes('youtu.be')) {
const parts = parsed.pathname.split('/').filter(Boolean);
videoId = parts[0] || null;
} else if (parsed.searchParams.get('v')) {
videoId = parsed.searchParams.get('v');
} else {
const match = parsed.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})/);
if (match) videoId = match[1];
}
if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
return videoId;
}
return null;
} catch {
return null;
}
}
//================
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
//================
export async function ytdownloader(url: string, format = 'mp3'): Promise<DownloadResult> {
const normFormat = String(format).toLowerCase();
if (!['mp3', 'mp4'].includes(normFormat)) {
throw new Error('MP3 or MP4 only.');
}
const videoId = getYouTubeVideoId(url);
if (!videoId) {
throw new Error('Enter a valid YouTube video link.');
}
const defaultHeaders = {
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
Accept: '*/*',
};
let lastError: Error | null = null;
for (const domain of DOMAINS) {
const requestHeaders = {
...defaultHeaders,
Origin: new URL(domain.baseURL).origin,
Referer: domain.baseURL,
};
const get = async <T = any>(target: string, config: AxiosRequestConfig = {}): Promise<T> => {
const absoluteUrl = new URL(target, domain.apiURL).href;
const response = await axios.get<T>(absoluteUrl, {
...config,
headers: { ...requestHeaders, ...(config.headers || {}) },
timeout: 30000,
maxRedirects: 5,
});
return response.data;
};
try {
const html = await get<string>(domain.baseURL, {
headers: { Accept: 'text/html,application/xhtml+xml' },
responseType: 'text',
});
const apiKeyMatch = typeof html === 'string'
? html.match(/var\s+apiKey\s*=\s*['"]([^'"]+)['"]\s*;?/)
: null;
const apiKey = apiKeyMatch?.[1];
if (!apiKey) {
throw new Error('API key not found on provider page.');
}
const auth = await get<{ err?: number | string; key?: string }>(`${domain.apiURL}/api/v1/auth`, {
params: { api_key: apiKey, _: Date.now() },
});
if (String(auth?.err) !== '0' || !auth?.key) {
throw new Error('Authentication failed.');
}
const init = await get<{ error?: number | string; convertURL?: string }>(`${domain.apiURL}/api/v1/init`, {
params: { _: Date.now() },
headers: { Authorization: `Bearer ${auth.key}` },
});
if (String(init?.error) !== '0' || !init?.convertURL) {
throw new Error('Initialization failed.');
}
const convertURL = new URL(init.convertURL, domain.apiURL);
convertURL.searchParams.set('v', videoId);
convertURL.searchParams.set('f', normFormat);
convertURL.searchParams.set('_', String(Date.now()));
let finalTitle = '';
let result = await get<{
  title?: string;
  name?: string;
  downloadURL?: string;
  redirectURL?: string;
  progressURL?: string;
  error?: string | number;
}>(convertURL.href);

if (result?.title || result?.name) {
  finalTitle = result.title || result.name || '';
}

let redirects = 0;
while (result?.redirectURL && redirects < 5) {
  result = await get(result.redirectURL);
  if (result?.title || result?.name) finalTitle = result.title || result.name || '';
  redirects++;
}

// 5. Polling
for (let i = 0; i < 30 && !result?.downloadURL; i++) {
  if (result?.error != null && !['0', 0, ''].includes(result.error as any)) {
    throw new Error(`Conversion failed: ${String(result.error).slice(0, 180)}`);
  }
  if (result?.title || result?.name) finalTitle = result.title || result.name || '';
  if (!result?.progressURL) break;

  await sleep(3000);
  result = await get(result.progressURL);
  if (result?.title || result?.name) finalTitle = result.title || result.name || '';
  redirects = 0;
  while (result?.redirectURL && redirects < 5) {
    result = await get(result.redirectURL);
    if (result?.title || result?.name) finalTitle = result.title || result.name || '';
    redirects++;
  }
}

if (result?.title || result?.name) {
  finalTitle = result.title || result.name || '';
}

if (!result?.downloadURL) {
  throw new Error('Conversion timed out or no download URL was returned.');
}

if ((!finalTitle || finalTitle === '') && result?.progressURL) {
  try {
    const progResult = await get(result.progressURL);
    if (progResult?.title || progResult?.name) {
      finalTitle = progResult.title || progResult.name || '';
    }
  } catch {}
}

if (!finalTitle || finalTitle === 'Your file is ready') {
  try {
    const oembedRes = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { timeout: 4000 });
    if (oembedRes.data?.title) {
      finalTitle = oembedRes.data.title;
    }
  } catch {}
}

const download = new URL(result.downloadURL, domain.apiURL);
if (!['http:', 'https:'].includes(download.protocol)) {
  throw new Error('Provider returned an invalid download URL.');
}

return {
  title: finalTitle || result.title || 'Your file is ready',
  downloadURL: download.href,
  format: normFormat,
};
} catch (err: any) {
lastError = new Error(`${domain.baseURL} failed: ${err.message || 'Unknown provider error'}`);
}
}
throw lastError || new Error('All conversion providers failed.');
}
//================