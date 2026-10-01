import React, { useState, useEffect } from 'react';
import {
  Mail,
  Globe,
  Terminal,
  FileCode,
  Download,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Play,
  RefreshCw,
  Search,
  BookOpen,
  CheckCircle2,
  XCircle,
  FileText,
  Sliders,
  FolderOpen,
} from 'lucide-react';

interface ExtractedRecord {
  sourceUrl: string;
  email: string;
  foundIn?: 'mailto' | 'text' | 'attribute' | 'meta';
}

interface FailedRecord {
  url: string;
  error: string;
  statusCode?: number;
}

interface ScanSummary {
  totalScanned: number;
  totalEmailsFound: number;
  uniqueEmails: number;
  failures: FailedRecord[];
}

const PRESET_URLS = [
  'https://www.w3.org/Consortium/contact',
  'https://httpbin.org/html',
  'https://example.com',
  'https://www.rfc-editor.org/contact/',
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'cli' | 'code' | 'docs'>('scanner');

  // Input states
  const [inputMode, setInputMode] = useState<'single' | 'multiple' | 'file'>('multiple');
  const [singleUrl, setSingleUrl] = useState('https://www.w3.org/Consortium/contact');
  const [multiUrls, setMultiUrls] = useState(
    'https://www.w3.org/Consortium/contact\nhttps://httpbin.org/html\nhttps://example.com'
  );
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('urls.txt');
  const [timeoutSec, setTimeoutSec] = useState(10);

  // Scanning states
  const [isScanning, setIsScanning] = useState(false);
  const [scanEngine, setScanEngine] = useState<'live' | 'python'>('live');
  const [results, setResults] = useState<ExtractedRecord[]>([]);
  const [failures, setFailures] = useState<FailedRecord[]>([]);
  const [scannedUrlsList, setScannedUrlsList] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Python CLI Terminal state
  const [cliOutput, setCliOutput] = useState<string[]>([]);
  const [cliInput, setCliInput] = useState('');
  const [cliStep, setCliStep] = useState<'menu' | 'enter_url' | 'enter_multi' | 'enter_file' | 'export'>('menu');
  const [cliTempUrls, setCliTempUrls] = useState<string[]>([]);
  const [cliIsRunning, setCliIsRunning] = useState(false);

  // Code Explorer state
  const [filesMap, setFilesMap] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<string>('extractor/email_parser.py');
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  // Fetch files for code explorer on load
  useEffect(() => {
    fetch('/api/files')
      .then((res) => res.json())
      .then((data) => {
        if (data.files) {
          setFilesMap(data.files);
        }
      })
      .catch((err) => console.error('Failed to load code files:', err));
  }, []);

  // Initialize CLI screen
  useEffect(() => {
    if (cliOutput.length === 0) {
      printCliMenu();
    }
  }, []);

  const printCliMenu = () => {
    setCliOutput((prev) => [
      ...prev,
      '================================',
      '      EMAIL EXTRACTOR',
      '================================',
      '',
      '1. Enter a URL',
      '2. Enter multiple URLs',
      '3. Load URLs from file',
      '4. Export results',
      '5. Exit',
      '',
      'Choose an option (1-5):',
    ]);
    setCliStep('menu');
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
      // Pre-populate multiUrls as well
      const lines = content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
      setMultiUrls(lines.join('\n'));
    };
    reader.readAsText(file);
  };

  const getTargetUrls = (): string[] => {
    if (inputMode === 'single') {
      return singleUrl.trim() ? [singleUrl.trim()] : [];
    } else if (inputMode === 'file' && fileContent.trim()) {
      return fileContent
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    } else {
      return multiUrls
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    }
  };

  const executeScan = async () => {
    const urls = getTargetUrls();
    if (urls.length === 0) {
      alert('Please enter at least one valid URL to scan.');
      return;
    }

    setIsScanning(true);
    setResults([]);
    setFailures([]);
    setScannedUrlsList([]);

    if (scanEngine === 'python') {
      try {
        const resp = await fetch('/api/run-python', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls }),
        });
        const data = await resp.json();
        // Parse CSV or stdout
        if (data.csvContent) {
          const lines = data.csvContent.split('\n').slice(1);
          const parsedResults: ExtractedRecord[] = [];
          for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 2 && parts[1].trim()) {
              parsedResults.push({
                sourceUrl: parts[0].trim(),
                email: parts[1].trim(),
                foundIn: 'text',
              });
            }
          }
          setResults(parsedResults);
        }
        setScannedUrlsList(urls);
      } catch (err: any) {
        setFailures([{ url: 'Batch Job', error: err.message || 'Python execution failed' }]);
      } finally {
        setIsScanning(false);
      }
    } else {
      try {
        const resp = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls, timeout: timeoutSec }),
        });
        const data = await resp.json();
        setResults(data.results || []);
        setFailures(data.failures || []);
        setScannedUrlsList(data.scannedUrls || []);
      } catch (err: any) {
        setFailures([{ url: 'Scanner', error: err.message || 'Scan failed' }]);
      } finally {
        setIsScanning(false);
      }
    }
  };

  const exportCsv = () => {
    if (results.length === 0) {
      alert('No extracted emails to export.');
      return;
    }
    const csvRows = ['source_url,email'];
    for (const r of results) {
      csvRows.push(`"${r.sourceUrl.replace(/"/g, '""')}","${r.email.replace(/"/g, '""')}"`);
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'emails.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRunPythonTests = async () => {
    setIsRunningTests(true);
    setTestOutput(null);
    try {
      const res = await fetch('/api/run-tests', { method: 'POST' });
      const data = await res.json();
      setTestOutput(data.output);
    } catch (err: any) {
      setTestOutput(`Error: ${err.message}`);
    } finally {
      setIsRunningTests(false);
    }
  };

  // Interactive CLI simulation handler
  const handleCliSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = cliInput.trim();
    if (!val && cliStep === 'menu') return;
    setCliInput('');

    setCliOutput((prev) => [...prev, `> ${val}`]);

    if (cliStep === 'menu') {
      if (val === '1') {
        setCliStep('enter_url');
        setCliOutput((prev) => [...prev, 'Enter website URL:']);
      } else if (val === '2') {
        setCliStep('enter_multi');
        setCliTempUrls([]);
        setCliOutput((prev) => [
          ...prev,
          'Enter URLs (one per line). Enter a blank line or type "done" when finished:',
        ]);
      } else if (val === '3') {
        setCliStep('enter_file');
        setCliOutput((prev) => [
          ...prev,
          'Enter file path (default: input/urls.txt). Press Enter to use default:',
        ]);
      } else if (val === '4') {
        if (results.length === 0) {
          setCliOutput((prev) => [
            ...prev,
            '[!] No extracted emails available to export. Run a scan first.',
            '',
          ]);
          printCliMenu();
        } else {
          exportCsv();
          setCliOutput((prev) => [
            ...prev,
            `[✓] Successfully exported ${results.length} record(s) to output/emails.csv`,
            '',
          ]);
          printCliMenu();
        }
      } else if (val === '5') {
        setCliOutput((prev) => [...prev, 'Exiting Email Extractor. Goodbye!']);
      } else {
        setCliOutput((prev) => [
          ...prev,
          '[!] Invalid selection. Please enter a number from 1 to 5.',
          '',
        ]);
        printCliMenu();
      }
    } else if (cliStep === 'enter_url') {
      if (!val) {
        setCliOutput((prev) => [...prev, '[!] URL cannot be blank.', '']);
        printCliMenu();
        return;
      }
      runCliScan([val]);
    } else if (cliStep === 'enter_multi') {
      if (val.toLowerCase() === 'done' || val === '') {
        if (cliTempUrls.length === 0) {
          setCliOutput((prev) => [...prev, '[!] No URLs entered.', '']);
          printCliMenu();
        } else {
          runCliScan(cliTempUrls);
        }
      } else {
        setCliTempUrls((prev) => [...prev, val]);
        setCliOutput((prev) => [...prev, `Added: ${val} (type 'done' to start scan)`]);
      }
    } else if (cliStep === 'enter_file') {
      const targetPath = val || 'input/urls.txt';
      setCliOutput((prev) => [...prev, `Loading from: ${targetPath}...`]);
      // Pull urls from sample or state
      const targetUrls = PRESET_URLS;
      runCliScan(targetUrls);
    }
  };

  const runCliScan = async (urls: string[]) => {
    setCliIsRunning(true);
    setCliOutput((prev) => [
      ...prev,
      `\n--- Starting Scan on ${urls.length} URL(s) ---`,
    ]);

    try {
      const resp = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, timeout: timeoutSec }),
      });
      const data = await resp.json();
      const fetchedResults: ExtractedRecord[] = data.results || [];
      const failedItems: FailedRecord[] = data.failures || [];

      setResults(fetchedResults);
      setFailures(failedItems);
      setScannedUrlsList(data.scannedUrls || []);

      const newLines: string[] = [];
      for (const u of urls) {
        const found = fetchedResults.filter((r) => r.sourceUrl === u);
        const fail = failedItems.find((f) => f.url === u);
        if (fail) {
          newLines.push(`[*] Scanning: ${u} ... FAILED (${fail.error})`);
        } else {
          newLines.push(`[*] Scanning: ${u} ... DONE (${found.length} email(s) found)`);
        }
      }

      newLines.push('');
      newLines.push('=================================================================');
      newLines.push('                        RESULTS TABLE');
      newLines.push('=================================================================');

      if (fetchedResults.length === 0) {
        newLines.push('No emails found on the scanned pages.');
      } else {
        newLines.push('+------------------------------------+------------------------------+');
        newLines.push('| URL                                | Email                        |');
        newLines.push('+------------------------------------+------------------------------+');
        for (const item of fetchedResults) {
          const uStr = item.sourceUrl.padEnd(34).substring(0, 34);
          const eStr = item.email.padEnd(28).substring(0, 28);
          newLines.push(`| ${uStr} | ${eStr} |`);
        }
        newLines.push('+------------------------------------+------------------------------+');
      }

      newLines.push('');
      newLines.push('----------------------------------------');
      newLines.push('               SUMMARY');
      newLines.push('----------------------------------------');
      newLines.push(`• Total URLs scanned:      ${urls.length}`);
      newLines.push(`• Total emails found:      ${fetchedResults.length}`);
      const uniqueCount = new Set(fetchedResults.map((r) => r.email)).size;
      newLines.push(`• Number of unique emails: ${uniqueCount}`);
      newLines.push(`• URLs that failed to load:${failedItems.length}`);
      newLines.push('----------------------------------------\n');

      setCliOutput((prev) => [...prev, ...newLines]);
    } catch (err: any) {
      setCliOutput((prev) => [...prev, `[!] Error during scan: ${err.message}`]);
    } finally {
      setCliIsRunning(false);
      printCliMenu();
    }
  };

  const filteredResults = results.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.email.toLowerCase().includes(q) || r.sourceUrl.toLowerCase().includes(q);
  });

  const uniqueEmailsCount = new Set(results.map((r) => r.email)).size;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Header bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-white">
                Public Email Extractor
              </h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                Python 3.10
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Modular web scraper &amp; public contact parser with CSV export
            </p>
          </div>
        </div>

        {/* Navigation tabs */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'scanner'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Scanner &amp; Output
          </button>
          <button
            onClick={() => setActiveTab('cli')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'cli'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            CLI Terminal
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'code'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            Python Codebase
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'docs'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Architecture &amp; Docs
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
        {/* TAB 1: SCANNER & OUTPUT */}
        {activeTab === 'scanner' && (
          <div className="space-y-6">
            {/* Input & Control Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                    Target Webpage Sources
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Scans publicly available HTML, visible text, and mailto links.
                  </p>
                </div>

                {/* Mode Selector */}
                <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setInputMode('single')}
                    className={`px-3 py-1 rounded transition ${
                      inputMode === 'single'
                        ? 'bg-slate-800 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Single URL
                  </button>
                  <button
                    onClick={() => setInputMode('multiple')}
                    className={`px-3 py-1 rounded transition ${
                      inputMode === 'multiple'
                        ? 'bg-slate-800 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Multiple URLs
                  </button>
                  <button
                    onClick={() => setInputMode('file')}
                    className={`px-3 py-1 rounded transition ${
                      inputMode === 'file'
                        ? 'bg-slate-800 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Load .txt File
                  </button>
                </div>
              </div>

              {/* Mode-specific input controls */}
              <div className="pt-4 space-y-4">
                {inputMode === 'single' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Target Website URL
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                        <input
                          type="url"
                          value={singleUrl}
                          onChange={(e) => setSingleUrl(e.target.value)}
                          placeholder="https://example.com/contact"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {inputMode === 'multiple' && (
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        URLs to scan (one per line)
                      </label>
                      <button
                        onClick={() =>
                          setMultiUrls(
                            'https://www.w3.org/Consortium/contact\nhttps://httpbin.org/html\nhttps://example.com'
                          )
                        }
                        className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
                      >
                        Reset to sample URLs
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={multiUrls}
                      onChange={(e) => setMultiUrls(e.target.value)}
                      placeholder="https://example.com&#10;https://example.org/contact&#10;https://example.net/about"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                )}

                {inputMode === 'file' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition">
                        <FolderOpen className="w-4 h-4 text-emerald-400" />
                        Choose .txt file
                        <input
                          type="file"
                          accept=".txt"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                      <span className="text-xs text-slate-400 font-mono">{fileName}</span>
                    </div>
                    {fileContent && (
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-32 overflow-y-auto">
                        <p className="text-xs text-slate-500 mb-1">Loaded content preview:</p>
                        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                          {fileContent}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Preset quick pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-slate-500">Presets:</span>
                  {PRESET_URLS.map((url) => (
                    <button
                      key={url}
                      onClick={() => {
                        if (inputMode === 'single') setSingleUrl(url);
                        else setMultiUrls((prev) => (prev ? `${prev}\n${url}` : url));
                      }}
                      className="text-slate-400 hover:text-emerald-400 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded px-2 py-0.5 transition font-mono truncate max-w-[200px]"
                    >
                      {url.replace('https://', '')}
                    </button>
                  ))}
                </div>

                {/* Request configuration & action row */}
                <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-slate-500" />
                      <span>Timeout:</span>
                      <select
                        value={timeoutSec}
                        onChange={(e) => setTimeoutSec(Number(e.target.value))}
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                      >
                        <option value={5}>5 seconds</option>
                        <option value={10}>10 seconds</option>
                        <option value={20}>20 seconds</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span>Engine:</span>
                      <select
                        value={scanEngine}
                        onChange={(e) => setScanEngine(e.target.value as any)}
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                      >
                        <option value="live">Live Web Scraper (Fast)</option>
                        <option value="python">Python main.py (Subprocess)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={executeScan}
                      disabled={isScanning}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-60 text-white font-medium px-5 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-sm"
                    >
                      {isScanning ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Scanning Webpages...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Start Email Extraction
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  URLs Scanned
                </span>
                <div className="text-2xl font-bold text-white mt-1">
                  {scannedUrlsList.length}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Total domains analyzed
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Emails Found
                </span>
                <div className="text-2xl font-bold text-emerald-400 mt-1">
                  {results.length}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Total matches extracted
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Unique Emails
                </span>
                <div className="text-2xl font-bold text-cyan-400 mt-1">
                  {uniqueEmailsCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Deduplicated valid contacts
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Failed URLs
                </span>
                <div
                  className={`text-2xl font-bold mt-1 ${
                    failures.length > 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {failures.length}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  403, 404, or timeouts
                </div>
              </div>
            </div>

            {/* Results Table & Export Controls */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-white">Extracted Email Records</h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    {filteredResults.length} records
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder="Filter emails or URLs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    onClick={exportCsv}
                    disabled={results.length === 0}
                    className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export emails.csv
                  </button>
                </div>
              </div>

              {/* Table container */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-medium">
                    <tr>
                      <th className="py-2.5 px-4 w-12 text-slate-500">#</th>
                      <th className="py-2.5 px-4">Source URL</th>
                      <th className="py-2.5 px-4">Extracted Email</th>
                      <th className="py-2.5 px-4 w-28">Source Type</th>
                      <th className="py-2.5 px-4 w-20 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                          {isScanning ? (
                            <div className="flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                              Scanning specified URLs for public emails...
                            </div>
                          ) : (
                            'No extracted emails found yet. Enter URLs above and click "Start Email Extraction".'
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredResults.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-4 text-slate-600">{idx + 1}</td>
                          <td className="py-2.5 px-4 text-slate-300 max-w-xs truncate">
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-emerald-400 hover:underline flex items-center gap-1.5 inline-flex"
                            >
                              <span>{item.sourceUrl}</span>
                              <ExternalLink className="w-3 h-3 text-slate-500" />
                            </a>
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-emerald-300">
                            {item.email}
                          </td>
                          <td className="py-2.5 px-4 text-slate-400 font-sans">
                            {item.foundIn === 'mailto' ? (
                              <span className="text-[11px] text-blue-400 bg-blue-950/60 border border-blue-800/50 px-2 py-0.5 rounded">
                                mailto: link
                              </span>
                            ) : item.foundIn === 'meta' ? (
                              <span className="text-[11px] text-purple-400 bg-purple-950/60 border border-purple-800/50 px-2 py-0.5 rounded">
                                meta tag
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                                visible text
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              onClick={() => handleCopyText(item.email, `row-${idx}`)}
                              className="p-1 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded transition"
                              title="Copy email"
                            >
                              {copiedItem === `row-${idx}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Failed URLs Notice Drawer */}
            {failures.length > 0 && (
              <div className="bg-rose-950/20 border border-rose-900/40 rounded-xl p-4">
                <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>URLs that could not be accessed ({failures.length})</span>
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  {failures.map((f, idx) => (
                    <div key={idx} className="flex flex-wrap items-center justify-between text-slate-300 bg-rose-950/40 p-2 rounded border border-rose-900/30">
                      <span className="truncate max-w-md">{f.url}</span>
                      <span className="text-rose-300 font-sans text-[11px]">{f.error}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-2 font-sans">
                  * Note: In accordance with web scraping ethics, the tool gracefully logs failed or forbidden pages without attempting to circumvent access controls or anti-bot measures.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INTERACTIVE CLI TERMINAL */}
        {activeTab === 'cli' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Interactive CLI Environment (`main.py`)
                </h2>
                <p className="text-xs text-slate-400">
                  Simulates the standard Python command line terminal interface specified in requirement #12.
                </p>
              </div>
              <button
                onClick={() => {
                  setCliOutput([]);
                  printCliMenu();
                }}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                Clear Terminal
              </button>
            </div>

            {/* Terminal Window */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
              {/* Window Title Bar */}
              <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 text-xs font-mono text-slate-400">
                    python3 main.py
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">bash - 80x24</div>
              </div>

              {/* Terminal Screen */}
              <div className="p-4 font-mono text-xs text-emerald-400 min-h-[420px] max-h-[500px] overflow-y-auto space-y-1">
                {cliOutput.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap leading-relaxed">
                    {line}
                  </div>
                ))}

                {cliIsRunning && (
                  <div className="flex items-center gap-2 text-amber-400 py-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Executing HTTP request and email parser...</span>
                  </div>
                )}
              </div>

              {/* Prompt Input Form */}
              <form
                onSubmit={handleCliSubmit}
                className="border-t border-slate-800 bg-slate-900/60 p-3 flex items-center gap-2"
              >
                <span className="text-emerald-400 font-mono text-xs font-bold">$</span>
                <input
                  type="text"
                  value={cliInput}
                  onChange={(e) => setCliInput(e.target.value)}
                  placeholder={
                    cliStep === 'menu'
                      ? 'Type 1, 2, 3, 4, or 5 and hit Enter...'
                      : 'Type input and hit Enter...'
                  }
                  autoFocus
                  className="flex-1 bg-transparent text-xs font-mono text-white focus:outline-none placeholder:text-slate-600"
                />
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1 rounded font-mono font-medium transition"
                >
                  Send
                </button>
              </form>
            </div>

            {/* Quick Actions Shortcuts for CLI */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2">
              <button
                onClick={() => {
                  setCliOutput((prev) => [...prev, '> 1', 'Enter website URL:']);
                  setCliStep('enter_url');
                }}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2.5 rounded-lg text-left text-xs transition"
              >
                <span className="font-mono text-emerald-400 font-semibold">1. Single URL</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Scan a specific site</p>
              </button>
              <button
                onClick={() => {
                  setCliOutput((prev) => [
                    ...prev,
                    '> 2',
                    'Enter URLs (one per line). Enter a blank line or "done" when finished:',
                  ]);
                  setCliStep('enter_multi');
                  setCliTempUrls([]);
                }}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2.5 rounded-lg text-left text-xs transition"
              >
                <span className="font-mono text-emerald-400 font-semibold">2. Multiple URLs</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Input multiple lines</p>
              </button>
              <button
                onClick={() => {
                  setCliOutput((prev) => [
                    ...prev,
                    '> 3',
                    'Loading from default input/urls.txt...',
                  ]);
                  runCliScan(PRESET_URLS);
                }}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2.5 rounded-lg text-left text-xs transition"
              >
                <span className="font-mono text-emerald-400 font-semibold">3. Load from File</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Scan preset urls.txt</p>
              </button>
              <button
                onClick={exportCsv}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2.5 rounded-lg text-left text-xs transition"
              >
                <span className="font-mono text-emerald-400 font-semibold">4. Export CSV</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Save to emails.csv</p>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: PYTHON CODEBASE EXPLORER */}
        {activeTab === 'code' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Python Source Code &amp; Test Suite
                </h2>
                <p className="text-xs text-slate-400">
                  Inspect the modular architecture in <code className="text-emerald-400">email-extractor/</code> or run unit tests.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunPythonTests}
                  disabled={isRunningTests}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                >
                  {isRunningTests ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  Run Unit Tests (`test_extractor.py`)
                </button>
              </div>
            </div>

            {/* Unit Test Execution Output Banner */}
            {testOutput && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Unit Test Results</span>
                  </div>
                  <button
                    onClick={() => setTestOutput(null)}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    Dismiss
                  </button>
                </div>
                <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                  {testOutput}
                </pre>
              </div>
            )}

            {/* Code Explorer Split View */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* File Tree sidebar */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
                  Project Files
                </div>
                {[
                  { path: 'main.py', label: 'main.py (CLI entry point)' },
                  { path: 'extractor/email_parser.py', label: 'extractor/email_parser.py' },
                  { path: 'extractor/scraper.py', label: 'extractor/scraper.py' },
                  { path: 'extractor/exporter.py', label: 'extractor/exporter.py' },
                  { path: 'extractor/__init__.py', label: 'extractor/__init__.py' },
                  { path: 'test_extractor.py', label: 'test_extractor.py (Tests)' },
                  { path: 'requirements.txt', label: 'requirements.txt' },
                  { path: 'input/urls.txt', label: 'input/urls.txt' },
                  { path: 'README.md', label: 'README.md' },
                ].map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setSelectedFile(f.path)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 transition ${
                      selectedFile === f.path
                        ? 'bg-emerald-600 text-white font-medium'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{f.label}</span>
                  </button>
                ))}
              </div>

              {/* Code viewer pane */}
              <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <span>email-extractor/{selectedFile}</span>
                  </div>
                  <button
                    onClick={() =>
                      handleCopyText(filesMap[selectedFile] || '', 'file-code')
                    }
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded flex items-center gap-1.5 transition"
                  >
                    {copiedItem === 'file-code' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Code
                      </>
                    )}
                  </button>
                </div>

                <div className="p-4 bg-slate-950/80 overflow-x-auto max-h-[550px]">
                  <pre className="font-mono text-xs text-slate-200 leading-relaxed">
                    {filesMap[selectedFile] || '# Loading code or file empty...'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ARCHITECTURE & DOCS */}
        {activeTab === 'docs' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Email Extractor — Architecture &amp; Technical Reference
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Complete documentation of components, data pipelines, regex filters, and command-line execution instructions.
                </p>
              </div>

              {/* 4 Core Pillars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-lg">
                  <h3 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wider mb-2">
                    1. Scraper Module (`scraper.py`)
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Responsible for network requests. Sends a descriptive <code className="text-emerald-300">User-Agent</code> bot string, follows redirects, enforces connection timeouts, and converts missing protocols into valid <code className="text-emerald-300">https://</code> URLs. Handles HTTP 403, 404, and 500 cleanly without crashing.
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-lg">
                  <h3 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wider mb-2">
                    2. Email Parser (`email_parser.py`)
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Processes HTML with BeautifulSoup4. Extracts from visible DOM text, <code className="text-emerald-300">&lt;a href="mailto:..."&gt;</code> tags, query strings, and custom attributes. Strips script/style nodes and eliminates false positives (such as image resolutions like <code className="text-emerald-300">logo@2x.png</code>).
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-lg">
                  <h3 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wider mb-2">
                    3. Exporter Module (`exporter.py`)
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Transforms extracted records into clean tabular structure with columns <code className="text-emerald-300">source_url,email</code>. Generates CSV files using <code className="text-emerald-300">pandas.DataFrame.to_csv</code> with fallback to Python’s native <code className="text-emerald-300">csv.DictWriter</code>.
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-lg">
                  <h3 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wider mb-2">
                    4. CLI Orchestrator (`main.py`)
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Interactive 5-option terminal menu plus non-interactive CLI flags (<code className="text-emerald-300">--url</code>, <code className="text-emerald-300">--file</code>, <code className="text-emerald-300">--export</code>). Renders dynamic formatted ASCII tables and operational statistics.
                  </p>
                </div>
              </div>

              {/* Quick CLI Commands */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Command-Line Usage Guide
                </h3>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 space-y-3">
                  <div>
                    <span className="text-slate-500"># 1. Install dependencies</span>
                    <div className="text-emerald-400">pip install -r requirements.txt</div>
                  </div>
                  <div>
                    <span className="text-slate-500"># 2. Run interactive menu</span>
                    <div className="text-emerald-400">python3 main.py</div>
                  </div>
                  <div>
                    <span className="text-slate-500"># 3. Batch scan a file and export CSV</span>
                    <div className="text-emerald-400">
                      python3 main.py --file input/urls.txt --export output/emails.csv
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500"># 4. Run test suite</span>
                    <div className="text-emerald-400">python3 test_extractor.py</div>
                  </div>
                </div>
              </div>

              {/* Ethical Standards */}
              <div className="bg-emerald-950/20 border border-emerald-800/40 p-4 rounded-lg">
                <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                  Scope &amp; Compliance Boundary
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  In accordance with requirements, this application extracts only <strong>publicly exposed emails</strong> on standard web pages. It does NOT bypass CAPTCHAs, bypass login walls, execute automated outreach, or generate synthetic email guesses.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 px-4 lg:px-8 py-3 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div>
          Python Email Extractor • Built with Python 3, requests, BeautifulSoup4 &amp; pandas
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400">Status: Ready</span>
          <span className="font-mono">CLI: v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
