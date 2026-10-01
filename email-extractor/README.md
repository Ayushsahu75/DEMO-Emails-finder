# Python Email Extraction Tool

A reliable, modular Python application designed to extract publicly available professional and business email addresses from websites and export the results to CSV.

---

## 1. Project Overview & Architecture

This tool strictly adheres to public data scraping ethics:
- **No private data scraping** or login bypass.
- **No CAPTCHA circumventing** or anti-bot evasions.
- **Polite request policies**: sends a descriptive `User-Agent` and enforces timeouts.
- **Graceful degradation**: if a page is forbidden (403), missing (404), or down, the scanner flags the failure and continues processing remaining targets without halting.

### Modular Project Layout

```text
email-extractor/
│
├── main.py                 # CLI interface, interactive menu, and argument orchestrator
├── test_extractor.py       # Comprehensive unit tests
├── requirements.txt        # Third-party dependencies (requests, beautifulsoup4, pandas)
├── README.md               # Complete documentation and user guide
│
├── extractor/
│   ├── __init__.py         # Package exports
│   ├── scraper.py          # HTTP requests, custom headers, timeouts, status handling
│   ├── email_parser.py     # HTML parsing, regex matching, mailto: extraction, normalization
│   └── exporter.py         # CSV file persistence and pandas integration
│
├── input/
│   └── urls.txt            # Batch URL inputs (one per line)
│
└── output/
    └── emails.csv          # Exported results (source_url, email)
```

---

## 2. Module Responsibilities

1. **`extractor/scraper.py` (`WebScraper`)**:
   - Manages HTTP/HTTPS requests with descriptive User-Agent: `EmailExtractorBot/1.0 (+https://github.com/email-extractor; public-content-audit)`.
   - Handles network timeouts, connection drops, and HTTP status codes (`403 Forbidden`, `404 Not Found`, `500 Server Error`).
   - Standardizes URLs (auto-prefixes `https://` if protocol omitted).
   - Built to work with `requests` with standard library (`urllib.request`) fallback.

2. **`extractor/email_parser.py` (`EmailParser`)**:
   - Uses `BeautifulSoup4` to scan visible textual content, `<a href="mailto:...">` anchors, and metadata tags.
   - Cleans emails: removes `mailto:` prefixes, URL query strings (`?subject=...`), surrounding punctuation, and converts all strings to lowercase.
   - Eliminates false positives such as image dimensions (`logo@2x.png`), icon assets, style files, and malformed strings.
   - Eliminates duplicates per site and globally.

3. **`extractor/exporter.py` (`CSVExporter`)**:
   - Formats records as `{"source_url": ..., "email": ...}`.
   - Writes to `output/emails.csv` using `pandas.DataFrame.to_csv` or Python's `csv.DictWriter`.

4. **`main.py` (`EmailExtractorApp`)**:
   - Provides the interactive CLI terminal menu (Options 1–5).
   - Provides command-line flag automation (`--url`, `--file`, `--export`).
   - Renders a formatted terminal table and scan statistics.

---

## 3. Installation

Requires **Python 3.8+**.

1. Clone or navigate to the repository directory:
   ```bash
   cd email-extractor
   ```

2. (Optional but recommended) Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install required packages:
   ```bash
   pip install -r requirements.txt
   ```

---

## 4. How to Run

### Interactive CLI Menu

Simply run:
```bash
python3 main.py
```

You will see:
```text
================================
      EMAIL EXTRACTOR
================================

1. Enter a URL
2. Enter multiple URLs
3. Load URLs from file
4. Export results
5. Exit

Choose an option:
```

### Automated Batch Command-Line Mode

- **Scan a single URL:**
  ```bash
  python3 main.py --url https://example.com --export output/emails.csv
  ```

- **Scan batch URLs from a text file:**
  ```bash
  python3 main.py --file input/urls.txt --export output/emails.csv
  ```

---

## 5. Input File Format (`input/urls.txt`)

Place URLs one per line:
```text
https://example.com
https://example.org/contact
https://example.net/about
```

Lines starting with `#` are treated as comments and ignored.

---

## 6. Output File Format (`output/emails.csv`)

```csv
source_url,email
https://example.com,contact@example.com
https://example.com,hello@example.com
https://example.net/about,team@example.net
```

---

## 7. Running Tests

Execute the unit test suite:
```bash
python3 test_extractor.py
```
Expected output:
```text
........
----------------------------------------------------------------------
Ran 8 tests in 0.05s

OK
```

---

## 8. Responsible Usage & Ethics Notice

This tool only extracts contact details that website owners have intentionally placed in public HTML for communication. Always respect `robots.txt`, Terms of Service, and data privacy regulations (e.g. GDPR, CAN-SPAM).
