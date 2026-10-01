"""
Email Extractor Package
Modular components for fetching web pages, discovering and validating public email addresses,
and exporting records to CSV format.
"""

from .scraper import WebScraper
from .email_parser import EmailParser
from .exporter import CSVExporter

__all__ = ["WebScraper", "EmailParser", "CSVExporter"]
