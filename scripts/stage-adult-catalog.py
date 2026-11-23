"""Stage an adult catalog export for the private API and the public page build."""
import argparse
import collections
import csv
import hashlib
import io
import json
import re
import unicodedata
import zipfile
from pathlib import Path
from urllib.parse import urlsplit


def slug_for(category):
    name = unicodedata.normalize("NFKD", category).encode("ascii", "ignore").decode().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", name).strip("-")[:80].rstrip("-")
    return f"{slug or 'category'}-{hashlib.sha256(category.encode()).hexdigest()[:10]}"


def https_url(value):
    parsed = urlsplit(value)
    return value if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password else ""


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def stage(source, target):
    groups = collections.defaultdict(list)
    seen = set()
    missing = 0
    with zipfile.ZipFile(source) as archive:
        with archive.open("video_links_with_thumbnails.csv") as raw:
            for row in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig")):
                category = row["category"].strip()
                source_url = https_url(row["video_url"].strip())
                if not category or not source_url or (category, source_url) in seen:
                    continue
                seen.add((category, source_url))
                thumbnail = https_url(row["thumbnail_url"].strip())
                missing += not thumbnail
                destination = https_url(row["destination_url"].strip()) or source_url
                groups[category].append({"watchUrl": destination, "thumbnailUrl": thumbnail})

    target.mkdir(mode=0o700)
    manifest = []
    for category, videos in sorted(groups.items(), key=lambda group: group[0].casefold()):
        slug = slug_for(category)
        directory = target / slug
        directory.mkdir()
        pages = (len(videos) + 19) // 20
        for number in range(pages):
            write_json(directory / f"{number + 1}.json", videos[number * 20:(number + 1) * 20])
        manifest.append({"name": category, "slug": slug, "count": len(videos), "pages": pages})
    write_json(target / "manifest.json", manifest)
    print(f"{len(seen)} placements, {len(manifest)} categories, {sum(row['pages'] for row in manifest)} pages, {missing} missing thumbnails")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip", type=Path)
    parser.add_argument("output", type=Path, help="New directory outside the public web root")
    args = parser.parse_args()
    stage(args.zip, args.output)
