//================
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import { ytdownloader, getYouTubeVideoId } from './src/downloader.js';
//================
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const storageDir = process.env.YTMP3_DATA_DIR || path.join(process.cwd(), 'storage');
const jobsDir = path.join(storageDir, 'jobs');
const publicDir = path.join(process.cwd(), 'public');
//================
fsSync.mkdirSync(jobsDir, { recursive: true, mode: 0o700 });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//================
interface Job {
id: string;
url: string;
videoId: string;
format: string;
status: 'queued' | 'processing' | 'completed' | 'failed';
title: string;
downloadURL: string;
error: string;
createdAt: string;
updatedAt: string;
createdUnix: number;
ipHash: string;
}
//================
const jobCache = new Map<string, Job>();
//================
async function readJob(id: string): Promise<Job | null> {
if (jobCache.has(id)) {
return jobCache.get(id)!;
}
const filePath = path.join(jobsDir, `${id}.json`);
try {
const raw = await fs.readFile(filePath, 'utf8');
const job = JSON.parse(raw) as Job;
jobCache.set(id, job);
return job;
} catch {
return null;
}
}
//================
async function writeJob(job: Job): Promise<void> {
job.updatedAt = new Date().toISOString();
jobCache.set(job.id, job);
const filePath = path.join(jobsDir, `${job.id}.json`);
const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
await fs.writeFile(temporary, JSON.stringify(job, null, 2), { mode: 0o600 });
await fs.rename(temporary, filePath);
}
//================
const ipRequestHistory = new Map<string, number[]>();
//================
function isIpThrottled(ipHash: string): boolean {
const now = Math.floor(Date.now() / 1000);
const cutoff = now - 60;
const timestamps = (ipRequestHistory.get(ipHash) || []).filter(t => t >= cutoff);
if (timestamps.length >= 8) {
ipRequestHistory.set(ipHash, timestamps);
return true;
}
timestamps.push(now);
ipRequestHistory.set(ipHash, timestamps);
return false;
}
//================
const processingIds = new Set<string>();
//================
async function processJob(id: string): Promise<void> {
if (processingIds.has(id)) return;
processingIds.add(id);
try {
const job = await readJob(id);
if (!job || job.status !== 'queued') return;
job.status = 'processing';
job.error = '';
await writeJob(job);
console.log(`[worker] Processing job ${job.id} (${job.format}) for URL: ${job.url}`);
try {
const result = await ytdownloader(job.url, job.format);
job.status = 'completed';
job.title = String(result.title || 'Your file is ready').slice(0, 300);
job.downloadURL = result.downloadURL;
job.error = '';
await writeJob(job);
console.log(`[worker] Completed job ${job.id}`);
} catch (err: any) {
job.status = 'failed';
job.error = String(err?.message || 'Conversion failed. Please try again.').slice(0, 260);
job.downloadURL = '';
await writeJob(job);
console.error(`[worker] Job failed [${job.id}]:`, err?.message || err);
}
} catch (err) {
console.error(`[worker] Unexpected error in job ${id}:`, err);
} finally {
processingIds.delete(id);
}
}
//================
async function cleanOldJobs() {
try {
const now = Date.now();
const files = await fs.readdir(jobsDir);
for (const file of files) {
if (!/^[a-f0-9]{32}\.json$/.test(file)) continue;
const id = file.replace('.json', '');
const job = await readJob(id);
if (!job) continue;
const createdTime = job.createdUnix * 1000 || Date.parse(job.createdAt);
const updatedTime = Date.parse(job.updatedAt || job.createdAt);
const isOld = now - createdTime > 24 * 3600 * 1000;
const isDoneOld = ['completed', 'failed'].includes(job.status) && (now - updatedTime > 3600 * 1000);
if (isOld || isDoneOld) {
jobCache.delete(id);
await fs.unlink(path.join(jobsDir, file)).catch(() => {});
}
}
} catch (err) {
console.error('[cleaner] Error during cleanup:', err);
}
}
setInterval(cleanOldJobs, 10 * 60 * 1000);
//================
async function handleCreate(req: Request, res: Response) {
if (req.method !== 'POST') {
return res.status(405).json({ success: false, error: 'Use POST to create a job.' });
}
const { url, format } = req.body || {};
const trimmedUrl = String(url || '').trim();
const chosenFormat = String(format || 'mp3').toLowerCase().trim();
if (!['mp3', 'mp4'].includes(chosenFormat)) {
return res.status(422).json({ success: false, error: 'Choose MP3 or MP4.' });
}
const videoId = getYouTubeVideoId(trimmedUrl);
if (!videoId) {
return res.status(422).json({ success: false, error: 'Enter a valid YouTube video link.' });
}
const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
const ipHash = crypto.createHash('sha256').update(clientIp).digest('hex');
if (isIpThrottled(ipHash)) {
return res.status(429).json({ success: false, error: 'Too many requests. Please wait a minute and try again.' });
}
const id = crypto.randomBytes(16).toString('hex');
const now = new Date().toISOString();
const newJob: Job = {
id,
url: `https://www.youtube.com/watch?v=${videoId}`,
videoId,
format: chosenFormat,
status: 'queued',
title: '',
downloadURL: '',
error: '',
createdAt: now,
updatedAt: now,
createdUnix: Math.floor(Date.now() / 1000),
ipHash,
};
try {
await writeJob(newJob);
} catch (err) {
console.error('[API] Failed to write job:', err);
return res.status(500).json({ success: false, error: 'Could not queue the conversion. Check storage permissions.' });
}
setTimeout(() => {
processJob(id).catch(err => console.error('[API] processJob error:', err));
}, 10);
return res.status(202).json({
success: true,
job: {
id,
status: 'queued',
format: chosenFormat,
},
});
}
//================
async function handleStatus(req: Request, res: Response) {
if (req.method !== 'GET') {
return res.status(405).json({ success: false, error: 'Use GET to check a job.' });
}
const id = String(req.query.id || '');
if (!/^[a-f0-9]{32}$/.test(id)) {
return res.status(400).json({ success: false, error: 'Invalid job ID.' });
}
const job = await readJob(id);
if (!job) {
return res.status(404).json({ success: false, error: 'Job not found or expired.' });
}
const publicJob: Record<string, any> = {
id: job.id,
status: job.status,
format: job.format,
};
if (job.status === 'completed') {
publicJob.title = job.title || 'Your file is ready';
if (job.downloadURL && /^https?:\/\//i.test(job.downloadURL)) {
publicJob.downloadURL = job.downloadURL;
}
} else if (job.status === 'failed') {
publicJob.error = job.error || 'Conversion failed. Please try again.';
}
return res.json({ success: true, job: publicJob });
}
//================
app.all('/', (req: Request, res: Response, next: NextFunction) => {
const apiParam = req.query.api;
if (apiParam === 'create') {
return handleCreate(req, res);
}
if (apiParam === 'status') {
return handleStatus(req, res);
}
next();
});
app.post('/api/create', handleCreate);
app.get('/api/status', handleStatus);
app.post(['/contact', '/contact/'], (req: Request, res: Response) => {
const { captcha } = req.body || {};
if (captcha && String(captcha).trim().toLowerCase() !== 'ytmp3') {
return res.status(400).json({ error: 'Incorrect captcha. Please enter "YTMP3".' });
}
return res.json({ message: 'Thank you! Your message has been sent.' });
});
app.use(express.static(publicDir));
app.get('*', (_req: Request, res: Response) => {
res.sendFile(path.join(publicDir, 'index.html'));
});
//================
app.listen(PORT, HOST, () => {
console.log(`[server] YTMP3 Converter running at http://${HOST}:${PORT}`);
});
