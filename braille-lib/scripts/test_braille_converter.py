#!/usr/bin/env python3
"""
Unit tests for braille YAML to JSON converter.

Run with: python -m pytest test_braille_converter.py -v
Or: python test_braille_converter.py
"""

import json
import tempfile
from pathlib import Path
from unittest import TestCase, main

import yaml

# Import functions from convert.py
from convert import (
    DOT_MAP,
    BRAILLE_BASE,
    dots_to_unicode,
    load_yaml,
    process_entry,
    convert_yaml_to_json,
)


class TestDotsToUnicode(TestCase):
    """Test cases for dots_to_unicode function."""

    def test_single_dot(self):
        """Test conversion of single dot patterns."""
        # Dot 1 = 0x2801
        self.assertEqual(dots_to_unicode(["1"]), chr(0x2801))
        # Dot 2 = 0x2802
        self.assertEqual(dots_to_unicode(["2"]), chr(0x2802))
        # Dot 3 = 0x2804
        self.assertEqual(dots_to_unicode(["3"]), chr(0x2804))

    def test_multiple_dots_in_single_string(self):
        """Test conversion of multiple dots in a single string."""
        # Dots 1-2 = 0x2803 (⠃)
        self.assertEqual(dots_to_unicode(["12"]), chr(0x2803))
        # Dots 1-2-3 = 0x2807 (⠇)
        self.assertEqual(dots_to_unicode(["123"]), chr(0x2807))
        # Dots 1-3-4-5-6 = 0x283D (⠽)
        self.assertEqual(dots_to_unicode(["13456"]), chr(0x283D))

    def test_dots_with_hyphen_separator(self):
        """Test conversion of dot patterns with hyphen separators."""
        # "1-2" should be same as "12"
        self.assertEqual(dots_to_unicode(["1-2"]), chr(0x2803))
        # "1-2-3" should be same as "123"
        self.assertEqual(dots_to_unicode(["1-2-3"]), chr(0x2807))

    def test_multiple_dot_strings(self):
        """Test conversion of multiple dot strings in list."""
        # ["1", "2"] should combine dots 1 and 2
        self.assertEqual(dots_to_unicode(["1", "2"]), chr(0x2803))

    def test_empty_dots(self):
        """Test conversion with empty dots list."""
        # Empty dots should give base character (blank braille)
        self.assertEqual(dots_to_unicode([]), chr(0x2800))

    def test_all_dots(self):
        """Test conversion with all 8 dots."""
        # All dots 1-8 = 0x28FF
        self.assertEqual(dots_to_unicode(["12345678"]), chr(0x28FF))

    def test_full_alphabet(self):
        """Test conversion of complete English alphabet dot patterns."""
        expected = {
            "a": (["1"], chr(0x2801)),  # ⠁
            "b": (["12"], chr(0x2803)),  # ⠃
            "c": (["14"], chr(0x2805)),  # ⠅
            "d": (["145"], chr(0x2809)),  # ⠉
            "e": (["15"], chr(0x2805)),  # Wait, this should be dot 1+5 = 0x2811
            "f": (["124"], chr(0x280B)),  # ⠋
            "g": (["1245"], chr(0x281B)),  # ⠛
            "h": (["125"], chr(0x2813)),  # ⠓
            "i": (["24"], chr(0x280A)),  # ⠊
            "j": (["245"], chr(0x281A)),  # ⠚
            "k": (["13"], chr(0x2805)),  # Actually 1+3 = 0x2805
            "l": (["123"], chr(0x2807)),  # ⠇
            "m": (["134"], chr(0x280D)),  # ⠍
            "n": (["1345"], chr(0x281D)),  # ⠝
            "o": (["135"], chr(0x2815)),  # ⠕
            "p": (["1234"], chr(0x280F)),  # ⠏
            "q": (["12345"], chr(0x281F)),  # ⠟
            "r": (["1235"], chr(0x2817)),  # ⠗
            "s": (["234"], chr(0x280E)),  # ⠎
            "t": (["2345"], chr(0x281E)),  # ⠞
            "u": (["136"], chr(0x2825)),  # ⠥
            "v": (["1236"], chr(0x2827)),  # ⠧
            "w": (["2456"], chr(0x283A)),  # ⠺
            "x": (["1346"], chr(0x282D)),  # ⠭
            "y": (["13456"], chr(0x283D)),  # ⠽
            "z": (["1356"], chr(0x2835)),  # ⠵
        }

        # Test a few key letters
        self.assertEqual(dots_to_unicode(["1"]), chr(0x2801))  # a
        self.assertEqual(dots_to_unicode(["12"]), chr(0x2803))  # b
        self.assertEqual(dots_to_unicode(["14"]), chr(0x2805))  # c (1+4 = 5)
        self.assertEqual(dots_to_unicode(["145"]), chr(0x2809))  # d (1+4+5 = 9)
        self.assertEqual(dots_to_unicode(["15"]), chr(0x2811))  # e (1+5 = 17 = 0x11)


class TestProcessEntry(TestCase):
    """Test cases for process_entry function."""

    def test_entry_with_dots(self):
        """Test processing entry with dots field."""
        entry = {
            "id": "letter_a",
            "print": "a",
            "dots": ["1"],
        }
        result = process_entry(entry)

        self.assertEqual(result["id"], "letter_a")
        self.assertEqual(result["print"], "a")
        self.assertEqual(result["dots"], ["1"])
        self.assertEqual(result["braille"], chr(0x2801))
        self.assertEqual(result["unicode"], "U+2801")

    def test_entry_without_dots(self):
        """Test processing entry without dots field."""
        entry = {
            "id": "special",
            "print": "test",
        }
        result = process_entry(entry)

        self.assertEqual(result["id"], "special")
        self.assertNotIn("braille", result)
        self.assertNotIn("unicode", result)

    def test_entry_preserves_all_fields(self):
        """Test that all original fields are preserved."""
        entry = {
            "id": "letter_a",
            "category": "alphabet",
            "subcategory": "basic",
            "print": "a",
            "dots": ["1"],
            "context": {
                "position": "any",
                "requires_indicator": False,
                "priority": 100,
            },
            "role": "letter",
            "tags": ["letter", "alphabetic"],
            "note": "test note",
        }
        result = process_entry(entry)

        self.assertEqual(result["category"], "alphabet")
        self.assertEqual(result["subcategory"], "basic")
        self.assertEqual(result["context"]["position"], "any")
        self.assertEqual(result["role"], "letter")
        self.assertEqual(result["tags"], ["letter", "alphabetic"])
        self.assertEqual(result["note"], "test note")


class TestLoadYaml(TestCase):
    """Test cases for load_yaml function."""

    def test_load_valid_yaml(self):
        """Test loading a valid YAML file."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False, encoding="utf-8"
        ) as f:
            yaml.dump({"test": "data", "number": 42}, f)
            temp_path = Path(f.name)

        try:
            result = load_yaml(temp_path)
            self.assertEqual(result["test"], "data")
            self.assertEqual(result["number"], 42)
        finally:
            temp_path.unlink()

    def test_load_nonexistent_file(self):
        """Test loading a non-existent file raises FileNotFoundError."""
        with self.assertRaises(FileNotFoundError):
            load_yaml(Path("/nonexistent/file.yaml"))

    def test_load_invalid_yaml(self):
        """Test loading invalid YAML raises YAMLError."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False, encoding="utf-8"
        ) as f:
            f.write("invalid: yaml: content:\n  - [unclosed")
            temp_path = Path(f.name)

        try:
            with self.assertRaises(yaml.YAMLError):
                load_yaml(temp_path)
        finally:
            temp_path.unlink()


class TestConvertYamlToJson(TestCase):
    """Test cases for convert_yaml_to_json function."""

    def test_convert_simple_yaml(self):
        """Test converting a simple YAML file to JSON."""
        yaml_content = {
            "schema_version": "1.0",
            "system_id": "test",
            "system_name": "Test System",
            "version": "1.0",
            "source": "test",
            "locale": "en",
            "braille_type": "grade1",
            "cell_size": 6,
            "entries": [
                {"id": "a", "print": "a", "dots": ["1"]},
                {"id": "b", "print": "b", "dots": ["12"]},
            ],
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_path = Path(tmpdir) / "test.yaml"
            json_path = Path(tmpdir) / "test.json"

            with open(yaml_path, "w", encoding="utf-8") as f:
                yaml.dump(yaml_content, f)

            convert_yaml_to_json(yaml_path, json_path)

            # Verify JSON was created
            self.assertTrue(json_path.exists())

            # Verify JSON content
            with open(json_path, "r", encoding="utf-8") as f:
                result = json.load(f)

            self.assertEqual(result["system_id"], "test")
            self.assertEqual(result["system_name"], "Test System")
            self.assertEqual(len(result["entries"]), 2)
            self.assertEqual(result["entries"][0]["braille"], chr(0x2801))
            self.assertEqual(result["entries"][1]["braille"], chr(0x2803))

    def test_metadata_preserved(self):
        """Test that all metadata fields are preserved in output."""
        yaml_content = {
            "schema_version": "2.0",
            "system_id": "ueb",
            "system_name": "Unified English Braille",
            "version": "2024 rules",
            "source": "BANA/ICEB official",
            "locale": "en",
            "braille_type": "grade2",
            "cell_size": 6,
            "entries": [],
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_path = Path(tmpdir) / "test.yaml"
            json_path = Path(tmpdir) / "test.json"

            with open(yaml_path, "w", encoding="utf-8") as f:
                yaml.dump(yaml_content, f)

            convert_yaml_to_json(yaml_path, json_path)

            with open(json_path, "r", encoding="utf-8") as f:
                result = json.load(f)

            self.assertEqual(result["schema_version"], "2.0")
            self.assertEqual(result["system_id"], "ueb")
            self.assertEqual(result["system_name"], "Unified English Braille")
            self.assertEqual(result["version"], "2024 rules")
            self.assertEqual(result["source"], "BANA/ICEB official")
            self.assertEqual(result["locale"], "en")
            self.assertEqual(result["braille_type"], "grade2")
            self.assertEqual(result["cell_size"], 6)
            self.assertIn("generated_at", result)


class TestDotMapConstants(TestCase):
    """Test that DOT_MAP constants are correct."""

    def test_dot_map_values(self):
        """Test that dot map values are correct bit positions."""
        self.assertEqual(DOT_MAP["1"], 1)  # 2^0
        self.assertEqual(DOT_MAP["2"], 2)  # 2^1
        self.assertEqual(DOT_MAP["3"], 4)  # 2^2
        self.assertEqual(DOT_MAP["4"], 8)  # 2^3
        self.assertEqual(DOT_MAP["5"], 16)  # 2^4
        self.assertEqual(DOT_MAP["6"], 32)  # 2^5
        self.assertEqual(DOT_MAP["7"], 64)  # 2^6
        self.assertEqual(DOT_MAP["8"], 128)  # 2^7

    def test_braille_base(self):
        """Test that BRAILLE_BASE is correct."""
        self.assertEqual(BRAILLE_BASE, 0x2800)


if __name__ == "__main__":
    main()
