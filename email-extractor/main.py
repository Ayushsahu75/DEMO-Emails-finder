#!/usr/bin/env python3
"""
Email Extractor CLI Application
Entry point for finding and extracting publicly available business emails
from websites and exporting results to CSV.
"""

import os
import sys
import argparse
from typing import List, Dict, Set

# Ensure extractor package is importable
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from extractor.scraper import WebScraper
from extractor.email_parser import EmailParser
from extractor.exporter import CSVExporter


class EmailExtractorApp:
    """
    Coordinates web scraping, email extraction, statistical tracking, and CSV export.
    """

    def __init__(self):
        self.scraper = WebScraper()
        self.parser = EmailParser()
        self.exporter = CSVExporter()
        self.results: List[Dict[str, str]] = []  # List of {"source_url": ..., "email": ...}
        self.scanned_urls: Set[str] = set()
        self.failed_urls: Dict[str, str] = {}    # url -> error reason

    def reset_results(self):
        """Clears accumulated scan records."""
        self.results.clear()
        self.scanned_urls.clear()
        self.failed_urls.clear()

    def process_url(self, raw_url: str):
        """
        Fetches a single URL, parses emails, and updates internal state.
        """
        clean_url = self.scraper.normalize_url(raw_url)
        if not clean_url:
            print("[!] Empty URL provided. Skipping.")
            return

        print(f"[*] Scanning: {clean_url} ...", end=" ", flush=True)
        self.scanned_urls.add(clean_url)

        html, error, status_code = self.scraper.fetch(clean_url)

        if error:
            print(f"FAILED ({error})")
            self.failed_urls[clean_url] = error
            return

        emails = self.parser.extract_emails(html)
        print(f"DONE ({len(emails)} email{'s' if len(emails) != 1 else ''} found)")

        for email in emails:
            # Check duplicate within this URL
            if not any(r["source_url"] == clean_url and r["email"] == email for r in self.results):
                self.results.append({
                    "source_url": clean_url,
                    "email": email
                })

    def process_url_list(self, urls: List[str]):
        """
        Processes a list of URLs sequentially with error isolation.
        """
        valid_urls = [u.strip() for u in urls if u.strip()]
        if not valid_urls:
            print("[!] No valid URLs provided.")
            return

        print(f"\n--- Starting Scan on {len(valid_urls)} URL(s) ---")
        for i, url in enumerate(valid_urls, start=1):
            print(f"[{i}/{len(valid_urls)}] ", end="")
            self.process_url(url)

        self.display_summary()

    def display_summary(self):
        """
        Prints the tabular results and summary statistics.
        """
        print("\n" + "=" * 65)
        print("                        RESULTS TABLE")
        print("=" * 65)

        if not self.results:
            print("No emails found on the scanned pages.")
        else:
            # Table formatting
            col_url_width = 34
            col_email_width = 28
            separator = f"+{'-' * (col_url_width + 2)}+{'-' * (col_email_width + 2)}+"
            header = f"| {'URL':<{col_url_width}} | {'Email':<{col_email_width}} |"

            print(separator)
            print(header)
            print(separator)

            for item in self.results:
                url_display = item["source_url"]
                if len(url_display) > col_url_width:
                    url_display = url_display[:col_url_width - 3] + "..."
                email_display = item["email"]
                if len(email_display) > col_email_width:
                    email_display = email_display[:col_email_width - 3] + "..."
                print(f"| {url_display:<{col_url_width}} | {email_display:<{col_email_width}} |")

            print(separator)

        # Statistical Summary
        total_urls = len(self.scanned_urls)
        total_emails = len(self.results)
        unique_emails = len(set(r["email"] for r in self.results))
        failed_count = len(self.failed_urls)

        print("\n" + "-" * 40)
        print("               SUMMARY")
        print("-" * 40)
        print(f"• Total URLs scanned:      {total_urls}")
        print(f"• Total emails found:      {total_emails}")
        print(f"• Number of unique emails: {unique_emails}")
        print(f"• URLs that failed to load:{failed_count}")

        if self.failed_urls:
            print("\nFailed URLs Details:")
            for failed_url, reason in self.failed_urls.items():
                print(f"  - {failed_url}: {reason}")
        print("-" * 40 + "\n")

    def export_csv(self, filename: str = "emails.csv"):
        """Exports currently loaded results to CSV."""
        if not self.results:
            print("[!] No extracted emails available to export. Run a scan first.")
            return

        filepath = self.exporter.export(self.results, filename=filename)
        print(f"[✓] Successfully exported {len(self.results)} record(s) to:\n    {filepath}\n")

    def run_cli_interactive(self):
        """
        Interactive text-based menu for standard CLI usage.
        """
        while True:
            print("================================")
            print("      EMAIL EXTRACTOR")
            print("================================")
            print()
            print("1. Enter a URL")
            print("2. Enter multiple URLs")
            print("3. Load URLs from file")
            print("4. Export results")
            print("5. Exit")
            print()

            try:
                choice = input("Choose an option: ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\n\nExiting Email Extractor. Goodbye!")
                break

            if choice == "1":
                url = input("\nEnter website URL: ").strip()
                if url:
                    self.process_url_list([url])
                else:
                    print("[!] URL cannot be blank.")
                input("\nPress Enter to return to menu...")

            elif choice == "2":
                print("\nEnter URLs (one per line). Enter a blank line when finished:")
                urls = []
                while True:
                    try:
                        line = input("> ").strip()
                        if not line:
                            break
                        urls.append(line)
                    except (KeyboardInterrupt, EOFError):
                        break
                if urls:
                    self.process_url_list(urls)
                else:
                    print("[!] No URLs entered.")
                input("\nPress Enter to return to menu...")

            elif choice == "3":
                default_path = os.path.join("input", "urls.txt")
                path_input = input(f"\nEnter file path (default: {default_path}): ").strip()
                target_file = path_input if path_input else default_path

                if not os.path.exists(target_file):
                    print(f"[!] File not found: {target_file}")
                else:
                    try:
                        with open(target_file, "r", encoding="utf-8") as f:
                            file_urls = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
                        if file_urls:
                            print(f"[✓] Loaded {len(file_urls)} URL(s) from {target_file}")
                            self.process_url_list(file_urls)
                        else:
                            print(f"[!] {target_file} contains no valid URLs.")
                    except Exception as e:
                        print(f"[!] Error reading file: {e}")
                input("\nPress Enter to return to menu...")

            elif choice == "4":
                file_name = input("Enter output filename (default: emails.csv): ").strip()
                self.export_csv(file_name if file_name else "emails.csv")
                input("\nPress Enter to return to menu...")

            elif choice == "5":
                print("\nExiting Email Extractor. Goodbye!")
                break

            else:
                print("\n[!] Invalid selection. Please enter a number from 1 to 5.\n")


def parse_arguments():
    """Defines command line flags for automated scripting."""
    parser = argparse.ArgumentParser(
        description="Extract publicly visible business emails from websites and export to CSV."
    )
    parser.add_argument("--url", type=str, help="Single URL to scan")
    parser.add_argument("--file", type=str, help="Path to text file containing list of URLs")
    parser.add_argument("--export", type=str, default=None, help="Automatically export results to specified CSV filename")
    return parser.parse_args()


def main():
    args = parse_arguments()
    app = EmailExtractorApp()

    # If CLI flags were passed, run in non-interactive batch mode
    if args.url:
        app.process_url_list([args.url])
        if args.export:
            app.export_csv(args.export)
    elif args.file:
        if os.path.exists(args.file):
            with open(args.file, "r", encoding="utf-8") as f:
                urls = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
            app.process_url_list(urls)
            if args.export:
                app.export_csv(args.export)
        else:
            print(f"[!] Specified file does not exist: {args.file}")
            sys.exit(1)
    else:
        # Launch interactive menu
        app.run_cli_interactive()


if __name__ == "__main__":
    main()
