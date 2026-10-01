import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec, spawn } from 'child_process';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const EXTRACTOR_DIR = path.resolve(__dirname, 'email-extractor');

// Utility: Normalize and validate URL
function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

// Route: Run python unit tests
app.post('/api/run-tests', (req: Request, res: Response) => {
  const testScript = path.join(EXTRACTOR_DIR, 'test_extractor.py');
  exec(`python3 ${testScript}`, { cwd: EXTRACTOR_DIR, timeout: 15000 }, (error, stdout, stderr) => {
    res.json({
      success: !error || error.code === 0,
      exitCode: error ? error.code : 0,
      output: (stdout + '\n' + stderr).trim(),
    });
  });
});

// Route: Run python script with URL or file
app.post('/api/run-python', (req: Request, res: Response) => {
  const { url, urls, file } = req.body;
  let cmd = `python3 ${path.join(EXTRACTOR_DIR, 'main.py')}`;

  if (url) {
    const safeUrl = url.replace(/"/g, '\\"');
    cmd += ` --url "${safeUrl}"`;
  } else if (file) {
    const safeFile = path.resolve(EXTRACTOR_DIR, file).replace(/"/g, '\\"');
    cmd += ` --file "${safeFile}"`;
  } else if (Array.isArray(urls) && urls.length > 0) {
    // Write temporary urls or pass via input file
    const tempFile = path.join(EXTRACTOR_DIR, 'input', 'temp_scan_urls.txt');
    fs.writeFileSync(tempFile, urls.join('\n'), 'utf-8');
    cmd += ` --file "${tempFile}"`;
  }

  cmd += ` --export "${path.join(EXTRACTOR_DIR, 'output', 'emails.csv')}"`;

  exec(cmd, { cwd: EXTRACTOR_DIR, timeout: 30000 }, (error, stdout, stderr) => {
    // Check if emails.csv was generated/updated
    const csvPath = path.join(EXTRACTOR_DIR, 'output', 'emails.csv');
    let csvContent = '';
    if (fs.existsSync(csvPath)) {
      csvContent = fs.readFileSync(csvPath, 'utf-8');
    }

    res.json({
      success: !error || error.code === 0,
      exitCode: error ? error.code : 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      csvContent,
    });
  });
});

// Route: Get source code files for the code explorer
app.get('/api/files', (req: Request, res: Response) => {
  const filePaths = [
    'main.py',
    'extractor/__init__.py',
    'extractor/scraper.py',
    'extractor/email_parser.py',
    'extractor/exporter.py',
    'test_extractor.py',
    'requirements.txt',
    'input/urls.txt',
    'README.md',
  ];

  const filesData: Record<string, string> = {};
  for (const relPath of filePaths) {
    const fullPath = path.join(EXTRACTOR_DIR, relPath);
    if (fs.existsSync(fullPath)) {
      filesData[relPath] = fs.readFileSync(fullPath, 'utf-8');
    } else {
      filesData[relPath] = '';
    }
  }

  res.json({ files: filesData });
});

// Route: Update input/urls.txt
app.post('/api/save-urls-file', (req: Request, res: Response) => {
  const { content } = req.body;
  const filePath = path.join(EXTRACTOR_DIR, 'input', 'urls.txt');
  fs.writeFileSync(filePath, content || '', 'utf-8');
  res.json({ success: true, message: 'urls.txt updated' });
});

// Route: Direct web scan endpoint (Node.js fallback + real-time scanner)
// This gives high-speed feedback with detailed source location (mailto vs text vs meta)
app.post('/api/scan', async (req: Request, res: Response) => {
  const { urls, timeout = 10 } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Please provide an array of URLs' });
  }

  const USER_AGENT = 'EmailExtractorBot/1.0 (+https://github.com/email-extractor; public-content-audit)';
  const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;
  const IGNORED_EXTENSIONS = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js',
    '.woff', '.woff2', '.ttf', '.mp4', '.mp3', '.pdf', '.zip'
  ];

  interface ScanRecord {
    sourceUrl: string;
    email: string;
    foundIn: 'mailto' | 'text' | 'attribute' | 'meta';
  }

  const results: ScanRecord[] = [];
  const failures: { url: string; error: string; statusCode?: number }[] = [];
  const scannedUrls: string[] = [];

  for (const rawUrl of urls) {
    const url = normalizeUrl(rawUrl);
    if (!url) continue;

    scannedUrls.push(url);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout * 1000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timer);

      if (!response.ok) {
        let msg = `HTTP ${response.status}: ${response.statusText}`;
        if (response.status === 403) {
          msg = 'HTTP 403: Access forbidden (the server blocks automated access)';
        } else if (response.status === 404) {
          msg = 'HTTP 404: Page not found';
        }
        failures.push({ url, error: msg, statusCode: response.status });
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('xml')) {
        failures.push({ url, error: `Skipped: Non-HTML content type (${contentType})`, statusCode: response.status });
        continue;
      }

      const html = await response.text();

      // Scan mailto: links
      const mailtoRegex = /href=["']mailto:([^"'>]+)["']/gi;
      let match;
      const seenOnPage = new Set<string>();

      while ((match = mailtoRegex.exec(html)) !== null) {
        const rawTarget = match[1].split('?')[0];
        const splitEmails = rawTarget.split(/[,;]/);
        for (let em of splitEmails) {
          em = decodeURIComponent(em.trim()).replace(/^mailto:/i, '').replace(/[.,;:!?)]+$/, '').toLowerCase();
          if (em.match(EMAIL_REGEX) && !seenOnPage.has(em)) {
            if (!IGNORED_EXTENSIONS.some(ext => em.endsWith(ext))) {
              seenOnPage.add(em);
              results.push({ sourceUrl: url, email: em, foundIn: 'mailto' });
            }
          }
        }
      }

      // Scan meta tags
      const metaRegex = /<meta[^>]+content=["']([^"']+)["'][^>]*>/gi;
      while ((match = metaRegex.exec(html)) !== null) {
        const content = match[1];
        if (content.includes('@')) {
          const emails = content.match(EMAIL_REGEX) || [];
          for (let em of emails) {
            em = em.replace(/[.,;:!?)]+$/, '').toLowerCase();
            if (!seenOnPage.has(em) && !IGNORED_EXTENSIONS.some(ext => em.endsWith(ext))) {
              seenOnPage.add(em);
              results.push({ sourceUrl: url, email: em, foundIn: 'meta' });
            }
          }
        }
      }

      // Strip scripts and styles
      const strippedHtml = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');

      const textMatches = strippedHtml.match(EMAIL_REGEX) || [];
      for (let em of textMatches) {
        em = em.replace(/[.,;:!?)]+$/, '').toLowerCase();
        if (!seenOnPage.has(em)) {
          if (!IGNORED_EXTENSIONS.some(ext => em.endsWith(ext))) {
            seenOnPage.add(em);
            results.push({ sourceUrl: url, email: em, foundIn: 'text' });
          }
        }
      }

    } catch (err: any) {
      let errorMsg = err.message || 'Connection error';
      if (err.name === 'AbortError') {
        errorMsg = `Request timed out after ${timeout} seconds`;
      }
      failures.push({ url, error: errorMsg });
    }
  }

  // Update output/emails.csv on disk as well
  try {
    const csvRows = ['source_url,email'];
    for (const r of results) {
      csvRows.push(`${r.sourceUrl},${r.email}`);
    }
    const outDir = path.join(EXTRACTOR_DIR, 'output');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(path.join(outDir, 'emails.csv'), csvRows.join('\n'), 'utf-8');
  } catch (e) {
    // Non-fatal
  }

  res.json({
    totalScanned: scannedUrls.length,
    scannedUrls,
    totalEmailsFound: results.length,
    uniqueEmails: Array.from(new Set(results.map(r => r.email))).length,
    failures,
    results,
  });
});

// Setup Vite middleware in dev or static serve in prod
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
