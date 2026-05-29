"""
Extracts logos from a zip where filenames = club names,
fuzzy-matches each to a club in the DB, stores as <id>.<ext> in
artifacts/api-server/logos/, and updates image_url.
Replaces any existing logo for a matched club.
"""
import os, sys, zipfile, shutil, difflib, re
from pathlib import Path
import mysql.connector

LOGOS_DIR = Path(__file__).parent.parent / "artifacts/api-server/logos"
ZIP_PATH  = Path(__file__).parent.parent / "attached_assets/Club_logos_1_1779295243345.zip"
EXTRACT_TMP = Path("/tmp/club_logos_extracted")

# ── 1. Extract zip ────────────────────────────────────────────────────────────
if EXTRACT_TMP.exists():
    shutil.rmtree(EXTRACT_TMP)
EXTRACT_TMP.mkdir(parents=True)

with zipfile.ZipFile(ZIP_PATH) as z:
    z.extractall(EXTRACT_TMP)

extracted = list(EXTRACT_TMP.iterdir())
print(f"Extracted {len(extracted)} files")

# ── 2. Connect to DB and fetch all clubs ─────────────────────────────────────
conn = mysql.connector.connect(
    host=os.environ["MYSQL_HOST"],
    port=int(os.environ.get("MYSQL_PORT", 3306)),
    user=os.environ["MYSQL_USER"],
    password=os.environ["MYSQL_PASSWORD"],
    database=os.environ["MYSQL_DATABASE"],
)
cur = conn.cursor(dictionary=True)
cur.execute("SELECT id, name FROM clubs ORDER BY id")
clubs = cur.fetchall()
print(f"Loaded {len(clubs)} clubs from DB")

club_names = [c["name"] for c in clubs]
club_by_name = {c["name"]: c["id"] for c in clubs}

def normalise(s):
    """lowercase, strip punctuation/extra spaces for comparison"""
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

norm_club_names = [(normalise(n), n) for n in club_names]

def best_match(query_name):
    q = normalise(query_name)
    scored = [(difflib.SequenceMatcher(None, q, nc).ratio(), orig) for nc, orig in norm_club_names]
    scored.sort(reverse=True)
    return scored[0]  # (score, club_name)

# ── 3. Match and copy ─────────────────────────────────────────────────────────
LOGOS_DIR.mkdir(parents=True, exist_ok=True)
updates = []  # (image_url, club_id)
unmatched = []

for img_path in extracted:
    stem = img_path.stem          # filename without extension = club name
    ext  = img_path.suffix.lower()
    if ext == ".jfif":
        ext = ".jpg"              # normalise jfif → jpg

    score, matched_club = best_match(stem)
    club_id = club_by_name[matched_club]

    # Remove any existing logo file for this club (any extension)
    for old in LOGOS_DIR.glob(f"{club_id}.*"):
        old.unlink()

    dest = LOGOS_DIR / f"{club_id}{ext}"
    shutil.copy2(img_path, dest)

    url = f"/api/logos/{club_id}{ext}"
    updates.append((url, club_id))

    marker = "✅" if score >= 0.75 else "⚠️ "
    print(f"  {marker} [{score:.2f}]  '{stem}'  →  [{club_id}] '{matched_club}'  →  {url}")
    if score < 0.75:
        unmatched.append((stem, matched_club, score))

# ── 4. Batch-update DB ───────────────────────────────────────────────────────
if updates:
    case_sql = " ".join(f"WHEN {cid} THEN %s" for _, cid in updates)
    id_list  = ",".join(str(cid) for _, cid in updates)
    values   = [url for url, _ in updates]
    cur.execute(f"UPDATE clubs SET image_url = CASE id {case_sql} END WHERE id IN ({id_list})", values)
    conn.commit()
    print(f"\n✅ Updated {cur.rowcount} clubs in the database")

cur.close()
conn.close()

# ── 5. Summary ────────────────────────────────────────────────────────────────
print(f"\nTotal logos processed : {len(updates)}")
print(f"Low-confidence matches: {len(unmatched)}")
if unmatched:
    print("\nReview these low-confidence matches:")
    for stem, matched, score in unmatched:
        print(f"  [{score:.2f}] '{stem}'  →  '{matched}'")
