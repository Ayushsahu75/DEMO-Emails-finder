"""
Web Scraper Module
Handles HTTP requests to fetch public web pages using a descriptive User-Agent,
reasonable timeouts, and graceful error handling.
"""

from typing import Tuple, Optional
from urllib.parse import urlparse

# Check if requests library is installed, provide standard library fallback
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    import urllib.request
    import urllib.error
    import socket


class WebScraper:
    """
    Fetches HTML content from public web URLs safely and respectfully.
    """

    DEFAULT_USER_AGENT = "EmailExtractorBot/1.0 (+https://github.com/email-extractor; public-content-audit)"
    DEFAULT_TIMEOUT = 10  # seconds

    def __init__(self, user_agent: Optional[str] = None, timeout: int = DEFAULT_TIMEOUT):
        """
        Initialize the scraper with a user agent and timeout.
        
        Args:
            user_agent: Custom User-Agent string. If None, default bot identifier is used.
            timeout: Maximum seconds to wait for a server response.
        """
        self.user_agent = user_agent or self.DEFAULT_USER_AGENT
        self.timeout = timeout
        self.session = None
        if REQUESTS_AVAILABLE:
            self.session = requests.Session()
            self.session.headers.update({"User-Agent": self.user_agent})

    def normalize_url(self, raw_url: str) -> str:
        """
        Ensures the URL has a proper scheme (defaulting to https://).
        
        Args:
            raw_url: URL string provided by user.
            
        Returns:
            Normalized URL with scheme.
        """
        url = raw_url.strip()
        if not url:
            return ""
        parsed = urlparse(url)
        if not parsed.scheme:
            # Prepend https:// if no protocol specified
            return f"https://{url}"
        return url

    def is_valid_url(self, url: str) -> bool:
        """
        Validates whether the string is a well-formed HTTP/HTTPS URL.
        """
        try:
            parsed = urlparse(url)
            return bool(parsed.scheme in ("http", "https") and parsed.netloc)
        except Exception:
            return False

    def fetch(self, url: str) -> Tuple[Optional[str], Optional[str], Optional[int]]:
        """
        Fetches the HTML content of the target URL.
        
        Returns:
            Tuple of (html_content, error_message, status_code).
            If successful, html_content is populated and error_message is None.
            If failed, html_content is None and error_message describes the cause.
        """
        clean_url = self.normalize_url(url)
        if not clean_url or not self.is_valid_url(clean_url):
            return None, "Invalid URL format. Must include a valid domain name.", None

        if REQUESTS_AVAILABLE:
            return self._fetch_with_requests(clean_url)
        else:
            return self._fetch_with_urllib(clean_url)

    def _fetch_with_requests(self, url: str) -> Tuple[Optional[str], Optional[str], Optional[int]]:
        """Fetch using requests library."""
        try:
            response = self.session.get(
                url,
                timeout=self.timeout,
                allow_redirects=True,
                headers={"User-Agent": self.user_agent}
            )
            status_code = response.status_code

            # Check for HTTP error statuses
            if status_code == 403:
                return None, "HTTP 403: Access forbidden (the server blocks automated access)", status_code
            elif status_code == 404:
                return None, "HTTP 404: Page not found", status_code
            elif status_code >= 500:
                return None, f"HTTP {status_code}: Remote server error", status_code
            elif status_code >= 400:
                return None, f"HTTP {status_code}: Client error", status_code

            # Check content type is HTML or text
            content_type = response.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type and "text/plain" not in content_type and "application/xhtml" not in content_type:
                # If non-HTML content (e.g. binary/PDF), return note
                return None, f"Skipped: Non-HTML content type ({content_type})", status_code

            return response.text, None, status_code

        except requests.exceptions.Timeout:
            return None, f"Request timed out after {self.timeout} seconds", None
        except requests.exceptions.ConnectionError:
            return None, "Connection failed: Host could not be reached or DNS resolution failed", None
        except requests.exceptions.TooManyRedirects:
            return None, "Too many redirects encountered", None
        except requests.exceptions.RequestException as e:
            return None, f"HTTP request error: {str(e)}", None
        except Exception as e:
            return None, f"Unexpected error while fetching URL: {str(e)}", None

    def _fetch_with_urllib(self, url: str) -> Tuple[Optional[str], Optional[str], Optional[int]]:
        """Fallback fetcher using Python standard library."""
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": self.user_agent}
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                status_code = resp.getcode()
                content_type = resp.headers.get("Content-Type", "").lower()
                if "text/html" not in content_type and "text/plain" not in content_type and "application/xhtml" not in content_type:
                    return None, f"Skipped: Non-HTML content type ({content_type})", status_code
                
                # Decode body
                raw_bytes = resp.read()
                charset = resp.headers.get_content_charset() or "utf-8"
                html_text = raw_bytes.decode(charset, errors="replace")
                return html_text, None, status_code

        except urllib.error.HTTPError as e:
            if e.code == 403:
                return None, "HTTP 403: Access forbidden (the server blocks automated access)", e.code
            elif e.code == 404:
                return None, "HTTP 404: Page not found", e.code
            else:
                return None, f"HTTP {e.code}: {e.reason}", e.code
        except urllib.error.URLError as e:
            return None, f"Connection failed: {str(e.reason)}", None
        except socket.timeout:
            return None, f"Request timed out after {self.timeout} seconds", None
        except Exception as e:
            return None, f"Unexpected error while fetching URL: {str(e)}", None
