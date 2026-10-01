#!/usr/bin/env python3
"""
Unit tests for Email Extractor components:
- EmailParser (regex, normalization, mailto links, filtering invalid patterns)
- CSVExporter (structure, schema, file creation)
- WebScraper (URL normalization, validation)
"""

import os
import shutil
import tempfile
import unittest

from extractor.email_parser import EmailParser
from extractor.exporter import CSVExporter
from extractor.scraper import WebScraper


class TestEmailParser(unittest.TestCase):
    def setUp(self):
        self.parser = EmailParser()

    def test_extract_from_text(self):
        sample_html = """
        <html>
            <body>
                <h1>Welcome to Acme Corp</h1>
                <p>For sales inquiries contact sales@acmecorp.com or call us.</p>
                <p>Support is available at support.team@service.org.</p>
            </body>
        </html>
        """
        emails = self.parser.extract_emails(sample_html)
        self.assertIn("sales@acmecorp.com", emails)
        self.assertIn("support.team@service.org", emails)

    def test_extract_mailto_links(self):
        sample_html = """
        <div>
            <a href="mailto:hello@startup.io">Say Hello</a>
            <a href="mailto:careers@startup.io?subject=Job%20Application">Join our team</a>
            <a href="mailto:press@startup.io,media@startup.io">Press inquiries</a>
        </div>
        """
        emails = self.parser.extract_emails(sample_html)
        self.assertIn("hello@startup.io", emails)
        self.assertIn("careers@startup.io", emails)
        self.assertIn("press@startup.io", emails)
        self.assertIn("media@startup.io", emails)

    def test_ignore_asset_false_positives(self):
        sample_html = """
        <div>
            <img src="/assets/logo@2x.png" alt="logo" />
            <img src="/icons/avatar@3x.jpg" />
            <link href="styles@v1.css" rel="stylesheet" />
            <p>Real contact: team@company.com</p>
        </div>
        """
        emails = self.parser.extract_emails(sample_html)
        self.assertIn("team@company.com", emails)
        self.assertNotIn("logo@2x.png", emails)
        self.assertNotIn("avatar@3x.jpg", emails)
        self.assertNotIn("styles@v1.css", emails)

    def test_deduplication_and_normalization(self):
        sample_html = """
        <p>Contact us at INFO@PARTNER.CO.UK or Info@Partner.co.uk or info@partner.co.uk.</p>
        <a href="mailto:INFO@PARTNER.CO.UK">Link</a>
        """
        emails = self.parser.extract_emails(sample_html)
        self.assertEqual(len(emails), 1)
        self.assertEqual(emails[0], "info@partner.co.uk")

    def test_subdomains_and_international_tlds(self):
        sample_html = """
        <p>Regional sales: sales@corp.co.in or support@eu.subdomain.org</p>
        """
        emails = self.parser.extract_emails(sample_html)
        self.assertIn("sales@corp.co.in", emails)
        self.assertIn("support@eu.subdomain.org", emails)


class TestWebScraper(unittest.TestCase):
    def setUp(self):
        self.scraper = WebScraper()

    def test_url_normalization(self):
        self.assertEqual(self.scraper.normalize_url("example.com"), "https://example.com")
        self.assertEqual(self.scraper.normalize_url("http://example.com"), "http://example.com")
        self.assertEqual(self.scraper.normalize_url("  https://test.org/contact  "), "https://test.org/contact")

    def test_invalid_url_detection(self):
        content, error, code = self.scraper.fetch("invalid_url_without_domain")
        self.assertIsNone(content)
        self.assertIsNotNone(error)


class TestCSVExporter(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.exporter = CSVExporter(output_dir=self.test_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_export_structure(self):
        records = [
            {"source_url": "https://example.com", "email": "contact@example.com"},
            {"source_url": "https://example.com", "email": "info@example.com"},
            {"source_url": "https://company.org", "email": "ceo@company.org"}
        ]
        out_path = self.exporter.export(records, "test_emails.csv")
        self.assertTrue(os.path.exists(out_path))

        with open(out_path, "r", encoding="utf-8") as f:
            content = f.read()

        lines = [line.strip() for line in content.splitlines() if line.strip()]
        self.assertEqual(lines[0], "source_url,email")
        self.assertEqual(lines[1], "https://example.com,contact@example.com")
        self.assertEqual(lines[2], "https://example.com,info@example.com")
        self.assertEqual(lines[3], "https://company.org,ceo@company.org")


if __name__ == "__main__":
    unittest.main()
