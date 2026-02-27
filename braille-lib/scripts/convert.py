#!/usr/bin/env python3

import argparse
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent.parent
SOURCE_DIR = BASE_DIR / "data" / "source"
OUTPUT_DIR = BASE_DIR / "data" / "output"

DOT_MAP = {"1": 1, "2": 2, "3": 4, "4": 8, "5": 16, "6": 32, "7": 64, "8": 128}
BRAILLE_BASE = 0x2800


@dataclass
class BrailleContext:
    position: str
    requires_indicator: bool
    priority: int


@dataclass
class BrailleEntry:
    id: str
    category: str
    subcategory: str
    print: str
    dots: list[str]
    braille: str
    unicode: str
    context: BrailleContext
    role: str
    tags: list[str]
    note: str = ""


@dataclass
class BrailleData:
    schema_version: str
    system_id: str
    system_name: str
    version: str
    source: str
    locale: str
    braille_type: str
    cell_size: int
    entries: list[dict]
    generated_at: str = ""

    def __post_init__(self):
        if not self.generated_at:
            self.generated_at = datetime.now(timezone.utc).isoformat()


def dots_to_unicode(dots: list[str]) -> str:
    bitmask = 0
    for dot in dots:
        if "-" in dot:
            for sub_dot in dot.split("-"):
                for char in sub_dot.strip():
                    bitmask |= DOT_MAP.get(char, 0)
        else:
            for char in dot:
                bitmask |= DOT_MAP.get(char, 0)
    return chr(BRAILLE_BASE + bitmask)


def load_yaml(filepath: Path) -> dict:
    logger.info(f"Loading YAML: {filepath}")
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        logger.error(f"File not found: {filepath}")
        raise
    except yaml.YAMLError as e:
        logger.error(f"YAML parsing error in {filepath}: {e}")
        raise


def process_entry(entry: dict) -> dict:
    result = entry.copy()

    if "dots" in entry:
        result["braille"] = dots_to_unicode(entry["dots"])
        result["unicode"] = f"U+{ord(result['braille']):04X}"

    return result


def convert_yaml_to_json(input_path: Path, output_path: Optional[Path] = None) -> None:
    data = load_yaml(input_path)

    processed_entries = [process_entry(e) for e in data.get("entries", [])]

    output = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "schema_version": data.get("schema_version", "1.0"),
        "system_id": data.get("system_id", ""),
        "system_name": data.get("system_name", ""),
        "version": data.get("version", ""),
        "source": data.get("source", ""),
        "locale": data.get("locale", ""),
        "braille_type": data.get("braille_type", ""),
        "cell_size": data.get("cell_size", 6),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "entries": processed_entries,
    }

    if output_path is None:
        output_path = OUTPUT_DIR / f"{input_path.stem}.json"

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    logger.info(f"JSON written to: {output_path}")


def process_directory(system: str, system_dir: Optional[Path] = None) -> None:
    if system_dir is None:
        system_dir = SOURCE_DIR / system

    if not system_dir.exists():
        logger.error(f"System directory not found: {system_dir}")
        raise FileNotFoundError(f"Directory not found: {system_dir}")

    yaml_files = list(system_dir.glob("*.yaml"))
    if not yaml_files:
        logger.warning(f"No YAML files found in {system_dir}")
        return

    logger.info(f"Found {len(yaml_files)} YAML files for system '{system}'")

    for yaml_file in yaml_files:
        try:
            convert_yaml_to_json(yaml_file)
        except Exception as e:
            logger.error(f"Failed to process {yaml_file}: {e}")
            continue


def parse_args():
    parser = argparse.ArgumentParser(description="Convert braille YAML to JSON")
    parser.add_argument("--input", "-i", help="Input YAML file or directory")
    parser.add_argument("--output", "-o", help="Output JSON file")
    parser.add_argument(
        "--system",
        "-s",
        choices=["ueb", "kana", "nemeth"],
        default="ueb",
        help="Braille system to process",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    if args.input:
        input_path = Path(args.input)
        if input_path.is_dir():
            for yaml_file in input_path.glob("*.yaml"):
                try:
                    convert_yaml_to_json(yaml_file)
                except Exception as e:
                    logger.error(f"Failed to process {yaml_file}: {e}")
        else:
            output_path = Path(args.output) if args.output else None
            convert_yaml_to_json(input_path, output_path)
    else:
        process_directory(args.system)


if __name__ == "__main__":
    main()
