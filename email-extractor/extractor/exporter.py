"""
CSV Exporter Module
Exports extracted email records into structured CSV format.
Supports pandas with a fallback to Python's standard csv module.
"""

import os
from typing import List, Dict, Optional

# Check if pandas is installed, provide fallback to standard csv library
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    import csv


class CSVExporter:
    """
    Handles persisting extracted email records to a structured CSV file.
    """

    DEFAULT_OUTPUT_DIR = "output"
    DEFAULT_FILENAME = "emails.csv"

    def __init__(self, output_dir: Optional[str] = None):
        """
        Args:
            output_dir: Target directory path for exported files.
        """
        self.output_dir = output_dir or self.DEFAULT_OUTPUT_DIR

    def export(self, records: List[Dict[str, str]], filename: Optional[str] = None) -> str:
        """
        Exports a list of records to CSV.
        
        Args:
            records: List of dictionaries with keys "source_url" and "email".
            filename: Target file name (defaults to emails.csv).
            
        Returns:
            The absolute path of the generated CSV file.
        """
        target_name = filename or self.DEFAULT_FILENAME
        
        # Ensure target directory exists
        os.makedirs(self.output_dir, exist_ok=True)
        filepath = os.path.join(self.output_dir, target_name)

        if PANDAS_AVAILABLE:
            self._export_with_pandas(records, filepath)
        else:
            self._export_with_csv(records, filepath)

        return os.path.abspath(filepath)

    def _export_with_pandas(self, records: List[Dict[str, str]], filepath: str):
        """Export using pandas DataFrame."""
        if not records:
            # Create empty dataframe with required schema
            df = pd.DataFrame(columns=["source_url", "email"])
        else:
            df = pd.DataFrame(records)
            # Ensure columns are ordered correctly
            if "source_url" in df.columns and "email" in df.columns:
                df = df[["source_url", "email"]]
        
        df.to_csv(filepath, index=False, encoding="utf-8")

    def _export_with_csv(self, records: List[Dict[str, str]], filepath: str):
        """Fallback exporter using standard library csv module."""
        with open(filepath, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["source_url", "email"])
            writer.writeheader()
            for record in records:
                writer.writerow({
                    "source_url": record.get("source_url", ""),
                    "email": record.get("email", "")
                })
