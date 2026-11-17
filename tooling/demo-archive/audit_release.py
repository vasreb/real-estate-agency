"""Independent stdlib ZIP/data audit. Never connects to a database or loads env."""

import collections
import hashlib
import json
import re
import shutil
import subprocess
import unicodedata
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
E = ROOT / ".omo/evidence/realistic-agency-archive"
PIN = "286f5c4ccf9313234bd626d014fbee050c985d5c7fe8f812929d3f7ca2d328fb"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(name):
    return json.loads((E / name).read_text(encoding="utf-8"))


def check(condition, message):
    if not condition:
        raise ValueError(message)


def stable_id(key):
    return str(
        uuid.uuid5(
            uuid.UUID("55d88e50-b71d-5bfa-966b-0ed82e9d2ace"),
            "northbridge-vale-archive-v1/" + key,
        )
    )


def safe_name(name):
    check(name == unicodedata.normalize("NFC", name), "Noncanonical Unicode path")
    check(not re.search(r'[\\:<>"|?*\x00-\x1f\x7f]', name), "Unsafe ZIP spelling")
    check(not name.startswith("/"), "Absolute path")
    for part in name.split("/"):
        check(
            part not in ("", ".", "..") and not part.endswith((".", " ")), "Path alias"
        )
        check(
            not re.match(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", part, re.I),
            "Device alias",
        )


def main():
    check(
        digest((ROOT / ".omo/plans/realistic-agency-archive.md").read_bytes()) == PIN,
        "Plan pin changed",
    )
    release = load("release-receipt.json")
    first = ROOT / "out/agency-demo-archive-v1.zip"
    second = ROOT / "out/agency-demo-archive/qa/reproduction-v1.zip"
    with first.open("rb") as a, second.open("rb") as b:
        h = hashlib.sha256()
        while True:
            left, right = a.read(128 * 1024), b.read(128 * 1024)
            check(left == right, "Independent-build ZIP bytes differ")
            if not left:
                break
            h.update(left)
    check(h.hexdigest() == release["zip_sha256"], "External ZIP pin mismatch")
    files, hashes, seen = {}, {}, set()
    with zipfile.ZipFile(first) as archive:
        entries = archive.infolist()
        check(len(entries) == 2420, "Wrong outer entry count")
        check(sum(i.file_size for i in entries) <= 640 * 1024**2, "Expanded budget")
        for info in entries:
            safe_name(info.filename)
            check(info.filename.lower() not in seen, "ZIP collision")
            seen.add(info.filename.lower())
            check(
                not info.flag_bits & 1
                and (info.external_attr >> 16) & 0xF000 in (0, 0x8000),
                "Encrypted or non-file entry",
            )
            check(
                info.file_size <= 32 * 1024**2
                and info.file_size <= max(1, info.compress_size) * 100,
                "Entry/ratio budget",
            )
            data = archive.read(info)  # stdlib independently checks CRC
            hashes[info.filename] = digest(data)
            if not info.filename.startswith("documents/"):
                files[info.filename] = data
        expected = {
            line[66:]: line[:64]
            for line in files["checksums.sha256"].decode().splitlines()
        }
        check(
            expected == {k: v for k, v in hashes.items() if k != "checksums.sha256"},
            "Checksum/file-set mismatch",
        )
        parsed = {k: json.loads(v) for k, v in files.items() if k.endswith(".json")}
        counts = {
            "teams": 3,
            "users": 10,
            "team-members": 13,
            "clients": 80,
            "properties": 96,
            "deals": 120,
        }
        for key, count in counts.items():
            check(len(parsed[f"entities/{key}.json"]) == count, f"Wrong {key} count")
        for user in parsed["entities/users.json"]:
            check(
                set(user) == {"id", "email"}
                and user["email"].endswith("@northbridge-vale.example"),
                "Private user data/domain",
            )
        docs = parsed["manifest/documents.json"]
        check(len(docs) == 2400, "Original count")
        mapped_keys = {
            "id",
            "deal_id",
            "parent_document_id",
            "type",
            "title",
            "document_number",
            "document_date",
            "effective_from",
            "status",
            "file_name",
            "mime_type",
            "created_at",
        }
        public_keys = {
            "mapped",
            "key",
            "family",
            "instrument_key",
            "event_key",
            "purpose",
            "author_role",
            "recipient_actor_keys",
            "path",
            "byte_length",
            "sha256",
            "unresolved_parent_reason",
            "revises_instrument_key",
            "provenance",
        }
        by_id = {r["mapped"]["id"]: r for r in docs}
        check(
            len(by_id) == 2400 and len({r["instrument_key"] for r in docs}) == 2400,
            "Duplicate identities/instruments",
        )
        for row in docs:
            check(
                set(row) == public_keys and set(row["mapped"]) == mapped_keys,
                "Unexpected public/mapped fields",
            )
            check(
                row["mapped"]["id"] == stable_id("document/" + row["key"]),
                "Unstable UUIDv5",
            )
            check(row["sha256"] == hashes.get(row["path"]), "Original digest mismatch")
            check(
                0 < row["byte_length"] < 25_000_000
                and len(archive.read(row["path"])) == row["byte_length"],
                "Original length mismatch",
            )
            if row["mapped"]["parent_document_id"]:
                parent = by_id[row["mapped"]["parent_document_id"]]["mapped"]
                check(
                    row["mapped"]["type"] == "amendment"
                    and parent["type"] == "contract"
                    and parent["deal_id"] == row["mapped"]["deal_id"],
                    "Invalid parent",
                )
        amendments = [r for r in docs if r["mapped"]["type"] == "amendment"]
        check(len(amendments) == 240, "Amendment count")
        per_deal = collections.Counter(r["mapped"]["deal_id"] for r in amendments)
        check(
            max(per_deal.values()) <= 6 and 120 - len(per_deal) >= 16,
            "Amendment distribution",
        )
        check(
            all(
                (r["mapped"]["status"] == "draft") == r["path"].endswith(".docx")
                for r in amendments
            ),
            "Amendment execution/format mismatch",
        )
        check(
            collections.Counter(r["mapped"]["status"] for r in amendments)
            == {"signed": 210, "draft": 20, "unknown": 10},
            "Amendment states",
        )
        unresolved = [
            r for r in amendments if r["mapped"]["parent_document_id"] is None
        ]
        check(
            len(unresolved) == 2
            and all(r["unresolved_parent_reason"] for r in unresolved),
            "Unresolved-parent identification",
        )
        check(
            collections.Counter(r["mapped"]["mime_type"] for r in docs)
            == {
                "application/pdf": 2160,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 240,
            },
            "Formats",
        )
        check(len({r["family"] for r in docs}) == 48, "Family coverage")
        original_bytes = sum(r["byte_length"] for r in docs)
        check(original_bytes == 17511094, "Original-byte total")
        deals = parsed["entities/deals.json"]
        check(
            collections.Counter(r["type"] for r in deals) == {"sale": 48, "rental": 72},
            "Deal types",
        )
        check(
            collections.Counter(
                collections.Counter(r["property_id"] for r in deals).values()
            )
            == {1: 72, 2: 24},
            "Property reuse",
        )
        check(
            sorted(collections.Counter(r["team_id"] for r in deals).values())
            == [24, 40, 56],
            "Team allocation",
        )
        profiles = parsed["manifest/property-profiles.json"]
        check(
            collections.Counter(r["category"] for r in profiles)
            == {
                "studio": 12,
                "one-bed-flat": 24,
                "two-bed-flat": 24,
                "maisonette": 12,
                "terraced-house": 18,
                "larger-house": 6,
            },
            "Property categories",
        )
        principals = parsed["manifest/actors.json"]["principals"]
        check(
            collections.Counter(r["kind"] for r in principals)
            == {"individual": 52, "household": 18, "corporate": 10},
            "Principal types",
        )
        check(
            all(
                len(p["signatory_keys"]) == 2
                for p in principals
                if p["kind"] == "household"
            ),
            "Household signatories",
        )
        timelines = {
            t["deal_id"]: t for t in parsed["manifest/scenario-timelines.json"]
        }
        groups = collections.defaultdict(list)
        for deal in deals:
            groups[deal["property_id"]].append(deal)
        transitions = collections.Counter()
        for group in groups.values():
            if len(group) == 2:
                first_deal, later_deal = sorted(
                    group, key=lambda d: timelines[d["id"]]["sequence"]
                )
                transitions[(first_deal["type"], later_deal["type"])] += 1
                first_matter, later_matter = (
                    timelines[first_deal["id"]],
                    timelines[later_deal["id"]],
                )
                check(
                    first_matter["counterparty_key"]
                    != later_matter["counterparty_key"],
                    "Repeated counterparty at relet",
                )
                if later_deal["type"] == "rental":
                    if later_matter["possession"] is None:
                        check(
                            later_matter["cohort"] in ("pre-let", "withdrawn-rental"),
                            "Missing supported possession in active relet",
                        )
                    else:
                        check(
                            first_matter["possession"]["end"]
                            < later_matter["possession"]["start"],
                            "Overlapping possession",
                        )
        check(
            transitions == {("rental", "rental"): 18, ("rental", "sale"): 6},
            "Reuse transitions",
        )
        check(
            collections.Counter(r["tenure"] for r in profiles)
            == {"leasehold": 69, "freehold": 27},
            "Tenure allocation",
        )
        check(
            len(parsed["manifest/sources-and-licenses.json"]["sources"]) == 14,
            "Source register",
        )
        check(
            parsed["reports/limitations.json"]["native_office_layout"] == "unverified",
            "Office limitation missing",
        )
        check(
            b"not for execution" in files["README.md"]
            and b"UNVERIFIED" in files["README.md"],
            "Standalone limitations",
        )
        pilot = json.loads(
            (ROOT / "out/agency-demo-archive/pilot-r7/pilot-manifest.json").read_text()
        )
        check(
            all(hashes.get(r["path"]) == r["sha256"] for r in pilot["originals"]),
            "Reviewed pilot bytes differ from final ZIP",
        )
    raster = load("full-v1-pdf/render-report.json")
    check(
        raster["original_pdfs"] == 2160
        and raster["pages"] == 3856
        and raster["process_max_rss_bytes"] <= 1024**3,
        "Full raster evidence/budget",
    )
    check(shutil.disk_usage(ROOT).free >= 8 * 1024**3, "Current free disk budget")
    norm = load("lf-verification.json")
    check(
        norm["matches_authorized_scope"] and not norm["mismatches"],
        "Tracked-file ownership drift",
    )
    for name in (
        "checks-static.json",
        "checks-workspace.json",
        "task-20-baseline-checks.json",
    ):
        check(load(name)["passed"], f"Required checks not green: {name}")
    browser = load("task-18-browser.json")
    check(
        browser["real_main_deals_browsed"] == 120
        and browser["families_downloaded"] == 48
        and not browser["page_errors"],
        "Main browser coverage",
    )
    check(
        load("task-18-access-cleanup.json")["dropped"]
        and load("task-18-session-cleanup.json")["existing_session_rows_preserved"],
        "Temporary access cleanup",
    )
    git = lambda *args, cwd=ROOT: subprocess.check_output(
        ["git", *args], cwd=cwd, text=True
    ).strip()
    check(
        git("rev-parse", "master") == "8b785f48dee6dc515b949f841a9535b0d293bd01",
        "Protected master changed",
    )
    check(
        not git("status", "--porcelain", cwd=ROOT.parent / "real-estate-agency"),
        "Protected original is dirty",
    )
    check(not git("diff", "--cached", "--name-only"), "Unapproved staged files")
    check(
        set(git("-c", "core.safecrlf=false", "diff", "--name-only").splitlines())
        == {"tooling/prepare.mjs", "tooling/tests/hooks.test.mjs"},
        "Unexpected semantic baseline changes",
    )
    result = {
        "approved": True,
        "method": "Independent Python stdlib ZIP/CRC/data audit plus actual command receipts",
        "zip_sha256": release["zip_sha256"],
        "source_digest": release["source_digest"],
        "entries": 2420,
        "originals": 2400,
        "families": 48,
        "original_bytes": original_bytes,
        "independent_rebuild_byte_identical": True,
        "reviewed_pilot_originals_equal_final_zip": len(pilot["originals"]),
        "protected_master_and_original": True,
        "only_authorized_baseline_repairs": True,
        "native_office_layout": "unverified",
    }
    (E / "final-F1.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(result))


if __name__ == "__main__":
    main()
