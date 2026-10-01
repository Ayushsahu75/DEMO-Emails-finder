"""
Email Parser Module
Extracts, cleans, normalizes, and validates publicly available email addresses
from HTML content, visible text, mailto: links, and exposed attributes.
"""

import re
from typing import List, Set
from urllib.parse import unquote

# Check if BeautifulSoup is installed, provide fallback to HTMLParser / regex
try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False
    from html.parser import HTMLParser


# Comprehensive regex for standard business and professional emails
# Follows RFC 5322 pragmatic subset for public web addresses
EMAIL_REGEX = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b"
)

# File extensions frequently mistaken for emails (e.g. icon@2x.png, font@1.0.woff)
IGNORED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico",
    ".tif", ".tiff", ".css", ".js", ".jsx", ".ts", ".tsx", ".woff",
    ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".mp3", ".wav", ".avi",
    ".zip", ".tar", ".gz", ".7z", ".rar", ".pdf", ".xml", ".json"
}

# Obvious dummy / placeholder templates
DUMMY_DOMAINS = {
    "example.com", "example.org", "example.net",
    "domain.com", "yoursite.com", "email.com",
    "mycompany.com", "yourdomain.com", "placeholder.com"
}


class SimpleHTMLParserFallback:
    """Fallback HTML scanner when BeautifulSoup4 is not installed."""
    @staticmethod
    def extract_sources(html: str) -> tuple:
        # Simple extraction of mailto: links and visible tags
        mailto_links = re.findall(r'href=["\']mailto:([^"?\'\s>]+)', html, re.IGNORECASE)
        # Strip script and style tags
        clean_text = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
        # Strip other HTML tags
        clean_text = re.sub(r'<[^>]+>', ' ', clean_text)
        return clean_text, mailto_links


class EmailParser:
    """
    Parses HTML documents to detect publicly visible email addresses.
    """

    def __init__(self, filter_placeholders: bool = False):
        """
        Args:
            filter_placeholders: If True, filters out example.com / dummy template emails.
        """
        self.filter_placeholders = filter_placeholders

    def is_valid_email(self, email: str) -> bool:
        """
        Validates email address structure and filters out binary assets and invalid tokens.
        """
        if not email or len(email) > 254:
            return False

        # Basic regex structure
        if not EMAIL_REGEX.fullmatch(email):
            return False

        # Must have exactly one @
        parts = email.split("@")
        if len(parts) != 2:
            return False

        local_part, domain_part = parts

        # Local part constraints
        if not local_part or len(local_part) > 64:
            return False
        if local_part.startswith(".") or local_part.endswith(".") or ".." in local_part:
            return False

        # Domain part constraints
        if not domain_part or "." not in domain_part:
            return False
        if domain_part.startswith(".") or domain_part.endswith(".") or ".." in domain_part:
            return False

        # Check ignored file extensions (e.g. image@2x.png)
        lower_email = email.lower()
        for ext in IGNORED_EXTENSIONS:
            if lower_email.endswith(ext):
                return False

        # Top-level domain must be valid letters (at least 2 chars)
        tld = domain_part.split(".")[-1]
        if not tld.isalpha() or len(tld) < 2:
            return False

        # Optional dummy domain filtering
        if self.filter_placeholders and domain_part.lower() in DUMMY_DOMAINS:
            return False

        return True

    def clean_email(self, raw_email: str) -> str:
        """
        Cleans and normalizes an email address.
        - Strips URL encodings (e.g. %20)
        - Removes mailto: prefixes if present
        - Strips query parameters (?subject=...)
        - Trims whitespace and trailing punctuation
        - Converts to lowercase
        """
        if not raw_email:
            return ""

        decoded = unquote(raw_email).strip()

        # Remove mailto: prefix if still present
        if decoded.lower().startswith("mailto:"):
            decoded = decoded[7:].strip()

        # Strip query parameters
        if "?" in decoded:
            decoded = decoded.split("?")[0].strip()

        # Strip common trailing punctuation often attached from prose
        decoded = decoded.rstrip(".,;:!?)'\"")
        decoded = decoded.lstrip("(<'\"")

        return decoded.lower()

    def extract_emails(self, html_content: str) -> List[str]:
        """
        Scans HTML content for email addresses across multiple locations:
        1. Visible text content
        2. <a href="mailto:..."> links
        3. Exposed HTML attributes (e.g. data-email, data-mailto)
        
        Returns:
            List of unique, cleaned, normalized email addresses in discovery order.
        """
        if not html_content or not isinstance(html_content, str):
            return []

        found_emails: Set[str] = set()
        ordered_emails: List[str] = []

        def add_candidate(raw: str):
            cleaned = self.clean_email(raw)
            if self.is_valid_email(cleaned) and cleaned not in found_emails:
                found_emails.add(cleaned)
                ordered_emails.append(cleaned)

        if BS4_AVAILABLE:
            self._extract_with_bs4(html_content, add_candidate)
        else:
            self._extract_with_fallback(html_content, add_candidate)

        # Final regex pass over the entire raw HTML to catch unformatted comments/scripts if any
        # were missed or within embedded JSON-LD schema blocks
        raw_matches = EMAIL_REGEX.findall(html_content)
        for match in raw_matches:
            add_candidate(match)

        return ordered_emails

    def _extract_with_bs4(self, html_content: str, callback):
        """Extract using BeautifulSoup4 parser."""
        try:
            soup = BeautifulSoup(html_content, "html.parser")

            # 1. Check all <a href="mailto:..."> links
            for anchor in soup.find_all("a", href=True):
                href = anchor["href"].strip()
                if href.lower().startswith("mailto:"):
                    # mailto: links can have multiple emails separated by comma or semicolon
                    mailto_target = href[7:].split("?")[0]
                    for item in re.split(r"[,;]", mailto_target):
                        callback(item)

            # 2. Check elements with explicit email attributes
            for tag in soup.find_all(attrs={"data-email": True}):
                callback(tag["data-email"])
            for tag in soup.find_all(attrs={"data-mailto": True}):
                callback(tag["data-mailto"])

            # 3. Check <meta> tags that expose contact info
            for meta in soup.find_all("meta"):
                content = meta.get("content", "")
                if "@" in content:
                    for match in EMAIL_REGEX.findall(content):
                        callback(match)

            # 4. Remove script and style tags to avoid false positives in code
            for removable in soup(["script", "style", "noscript", "svg"]):
                removable.decompose()

            # 5. Extract emails from visible text content
            visible_text = soup.get_text(separator=" ")
            for match in EMAIL_REGEX.findall(visible_text):
                callback(match)

        except Exception:
            # Fallback to regex if BeautifulSoup parsing hits unexpected malformed HTML
            self._extract_with_fallback(html_content, callback)

    def _extract_with_fallback(self, html_content: str, callback):
        """Fallback extraction when bs4 is not available."""
        # 1. Search for mailto: links via regex
        mailto_matches = re.findall(r'href=["\']mailto:([^"?\'\s>]+)', html_content, re.IGNORECASE)
        for link in mailto_matches:
            for item in re.split(r"[,;]", link):
                callback(item)

        # 2. Remove script and style blocks
        clean_text = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', ' ', html_content, flags=re.DOTALL | re.IGNORECASE)
        
        # 3. Remove HTML tags
        clean_text = re.sub(r'<[^>]+>', ' ', clean_text)

        # 4. Find all emails in cleaned text
        for match in EMAIL_REGEX.findall(clean_text):
            callback(match)
