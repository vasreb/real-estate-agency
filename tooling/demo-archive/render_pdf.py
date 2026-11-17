"""Original-byte PDF raster/structure gate. Native Word layout is not claimed."""

import argparse
import io
import json
import time
import os
import shutil
from collections import Counter
from pathlib import Path
import fitz
from PIL import Image, ImageDraw
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
NOTICE = "Synthetic demonstration document - not for execution"


def peak_rss_bytes():
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        class Counters(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
                (name, ctypes.c_size_t)
                for name in [
                    "PeakWorkingSetSize",
                    "WorkingSetSize",
                    "QuotaPeakPagedPoolUsage",
                    "QuotaPagedPoolUsage",
                    "QuotaPeakNonPagedPoolUsage",
                    "QuotaNonPagedPoolUsage",
                    "PagefileUsage",
                    "PeakPagefileUsage",
                ]
            ]

        counter = Counters()
        counter.cb = ctypes.sizeof(counter)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        psapi.GetProcessMemoryInfo.argtypes = [
            wintypes.HANDLE,
            ctypes.POINTER(Counters),
            wintypes.DWORD,
        ]
        if not psapi.GetProcessMemoryInfo(
            kernel.GetCurrentProcess(), ctypes.byref(counter), counter.cb
        ):
            raise OSError("Cannot measure PDF validation peak RSS")
        return counter.PeakWorkingSetSize
    import resource

    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (
        1 if os.uname().sysname == "Darwin" else 1024
    )


def inspect_pdf(data, retain=False):
    independent = PdfReader(io.BytesIO(data), strict=True)
    doc = fitz.open(stream=data, filetype="pdf")
    if len(independent.pages) != len(doc) or not len(doc):
        raise ValueError("Parser page-count mismatch or empty PDF")
    metrics, thumbs = [], []
    for number, page in enumerate(doc):
        text = page.get_text()
        extracted = independent.pages[number].extract_text()
        if Counter(c for c in extracted if not c.isspace()) != Counter(
            c for c in text if not c.isspace()
        ):
            raise ValueError(f"Clipped or lost PDF text on page {number + 1}")
        if NOTICE not in text:
            raise ValueError(f"Missing detached-page notice on page {number + 1}")
        if len(text.replace(NOTICE, "").strip()) < 40:
            raise ValueError(f"Blank or insubstantial page {number + 1}")
        spans = [
            s
            for b in page.get_text("dict")["blocks"]
            if "lines" in b
            for line in b["lines"]
            for s in line["spans"]
        ]
        for span in spans:
            x0, y0, x1, y1 = span["bbox"]
            if (
                x0 < -0.1
                or y0 < -0.1
                or x1 > page.rect.width + 0.1
                or y1 > page.rect.height + 0.1
            ):
                raise ValueError(f"Text outside page bounds on page {number + 1}")
        pix = page.get_pixmap(matrix=fitz.Matrix(96 / 72, 96 / 72), alpha=False)
        image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        if image.getextrema() == ((255, 255), (255, 255), (255, 255)):
            raise ValueError(f"Blank rendered page {number + 1}")
        if retain and number in {0, len(doc) // 2, len(doc) - 1}:
            image.thumbnail((400, 566))
            thumbs.append((number + 1, image.copy()))
        metrics.append(
            {
                "page": number + 1,
                "text_characters": len(text),
                "spans": len(spans),
                "render_width": pix.width,
                "render_height": pix.height,
            }
        )
    doc.close()
    return metrics, thumbs


def owned(value):
    target = Path(value).resolve()
    if not target.is_relative_to(ROOT):
        raise ValueError("QA path must remain inside execution worktree")
    return target


def self_test():
    for mode in ["blank", "overflow", "broken"]:
        try:
            if mode == "broken":
                inspect_pdf(b"%PDF-1.7\nbroken")
            else:
                doc = fitz.open()
                page = doc.new_page(width=300, height=300)
                if mode == "overflow":
                    page.insert_text((10, 20), NOTICE, fontsize=5)
                    page.insert_text(
                        (10, 50),
                        "A complete meaningful baseline paragraph supports this layout mutation.",
                        fontsize=6,
                    )
                    page.insert_text(
                        (290, 150),
                        "Text outside bounds cannot form a complete valid page",
                    )
                inspect_pdf(doc.tobytes())
            raise AssertionError("Mutation unexpectedly accepted: " + mode)
        except Exception as exc:
            if isinstance(exc, AssertionError):
                raise
            if mode == "overflow" and "Clipped or lost PDF text" not in str(exc):
                raise AssertionError(
                    "Overflow fixture failed for a different reason"
                ) from exc
    print("PDF self-test: blank/overflow/broken originals rejected")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--evidence")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.input or not args.evidence:
        parser.error("--input and --evidence are required")
    start = time.perf_counter()
    source, evidence = owned(args.input), owned(args.evidence)
    free_disk = shutil.disk_usage(ROOT).free
    if free_disk < 8 * 1024**3:
        raise ValueError("Insufficient PDF validation disk headroom")
    files = sorted(source.rglob("*.pdf"))
    if not files:
        raise ValueError("No original PDFs found; validation cannot silently skip")
    evidence.mkdir(parents=True, exist_ok=True)
    reports = []
    for index, file in enumerate(files):
        metrics, thumbs = inspect_pdf(file.read_bytes(), retain=True)
        if peak_rss_bytes() > 1024**3:
            raise ValueError("PDF validation peak RSS exceeds 1GiB")
        sheet = Image.new("RGB", (max(1, len(thumbs)) * 420, 610), "#e7e9eb")
        draw = ImageDraw.Draw(sheet)
        for col, (number, image) in enumerate(thumbs):
            sheet.paste(image, (col * 420 + 10, 30))
            draw.text(
                (col * 420 + 10, 8), f"Page {number} / {len(metrics)}", fill="black"
            )
        sheet.save(evidence / f"contact-{index + 1:04d}.png")
        reports.append(
            {
                "path": file.relative_to(source).as_posix(),
                "pages": len(metrics),
                "metrics": metrics,
                "contact_sheet": f"contact-{index + 1:04d}.png",
            }
        )
    receipt = {
        "original_pdfs": len(files),
        "pages": sum(r["pages"] for r in reports),
        "dpi": 96,
        "workers": 1,
        "elapsed_seconds": round(time.perf_counter() - start, 3),
        "native_docx_layout": "unverified",
        "process_max_rss_bytes": peak_rss_bytes(),
        "free_disk_bytes_at_start": free_disk,
        "reports": reports,
    }
    (evidence / "render-report.json").write_text(
        json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({k: v for k, v in receipt.items() if k != "reports"}))


if __name__ == "__main__":
    main()
