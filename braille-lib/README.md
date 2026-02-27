# braille-lib

Braille data pipeline: YAML source definitions → JSON data files consumed by braille-vscode and other downstream projects.

## Structure

```
data/
├── source/        ← YAML source files (ground truth)
│   ├── ueb/       UEB (Unified English Braille)
│   ├── kana/      Japanese Kana braille
│   └── nemeth/    Nemeth math braille
└── output/        ← generated JSON (do not edit by hand)

scripts/
├── convert.py                ← YAML → JSON converter
└── test_braille_converter.py ← unit tests for converter
```

## Usage

```bash
# Install dependencies
pip install -r requirements.txt

# Generate all JSON files for a system
python scripts/convert.py --system ueb
python scripts/convert.py --system kana
python scripts/convert.py --system nemeth

# Convert a single file
python scripts/convert.py --input data/source/ueb/alphabet.yaml

# Run tests
python -m pytest scripts/test_braille_converter.py -v
```
