"""Family index of already-rendered original-byte contact sheets; no QA approval."""

import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]


def owned(value):
    result = (ROOT / value).resolve()
    if not result.is_relative_to(ROOT):
        raise ValueError("Review paths must stay in the worktree")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot", required=True)
    parser.add_argument("--rasters", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    pilot, rasters, output = owned(args.pilot), owned(args.rasters), owned(args.output)
    docs = json.loads((pilot / "canonical-documents.json").read_text(encoding="utf-8"))
    report = json.loads((rasters / "render-report.json").read_text(encoding="utf-8"))
    rendered = {r["path"]: r for r in report["reports"]}
    selected = []
    for family in sorted({d["family"] for d in docs}):
        doc = next(d for d in docs if d["family"] == family and d["format"] == "pdf")
        row = rendered[doc["path"]]
        selected.append(
            {
                "family": family,
                "key": doc["key"],
                "original": doc["path"],
                "contact": row["contact_sheet"],
            }
        )
    output.mkdir(exist_ok=False)
    for start in range(0, len(selected), 6):
        canvas = Image.new("RGB", (1260, 6 * 640), "#dde3e6")
        draw = ImageDraw.Draw(canvas)
        for pos, row in enumerate(selected[start : start + 6]):
            draw.text(
                (12, pos * 640 + 4),
                f"{row['family']} | {row['key']} | ORIGINAL PDF first/middle/last",
                fill="black",
            )
            with Image.open(rasters / row["contact"]) as image:
                canvas.paste(image, (0, pos * 640 + 24))
        canvas.save(output / f"families-{start // 6 + 1:02d}.png")
    (output / "index.json").write_text(
        json.dumps(selected, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
