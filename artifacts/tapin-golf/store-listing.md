# TapIn Golf — Store Listing (ASO-optimised)

Last updated: 4 July 2026. Paste these into Google Play Console / App Store Connect.

Primary keywords targeted: *golf booking, tee times, South Africa, golf courses, scorecard, handicap, stableford*. Main SA competitors: PlayGolf App, Teesheet, golfscape — none combine booking + scoring + split payments, which is TapIn's differentiator.

---

## Google Play

**App name** (max 30 chars — 29 used):
```
TapIn Golf – Tee Time Booking
```

**Short description** (max 80 chars — 78 used):
```
Book tee times at 500+ South African golf clubs. Split bills & track scores.
```

**Full description** (max 4000 chars):
```
TapIn Golf is South Africa's all-in-one golf app — book tee times, keep your scorecard, play with friends and pay securely, all from your phone.

⛳ BOOK TEE TIMES IN SECONDS
Browse 500+ golf clubs and courses across South Africa. See live tee sheet availability, green fees and facilities, and book a 1-ball to 4-ball in a few taps.

💳 PAY YOUR WAY
Pay the full booking or split the bill with your playing partners. Secure payments via Instant EFT or card, in Rand. Everyone pays their own share — no more chasing mates for green fees.

👥 PLAY WITH FRIENDS
Add friends, invite them to your booking, and see who's playing. Your fourball, sorted.

📊 LIVE SCORING & SCORECARDS
Keep score hole-by-hole: Stableford, medal (stroke play), match play, betterball and more. Track your course and playing handicap, and share your round when you tap in. Friends you played with can view the scorecard from their own profile.

🏆 CLUB COMPETITIONS
Enter club tournaments, view draws and results, verify your marker's card and follow leaderboards.

🇿🇦 BUILT FOR SOUTH AFRICAN GOLF
From Gauteng to the Western Cape, TapIn Golf covers courses in every province — with local payments and pricing in Rand.

Download TapIn Golf and get back to what matters: playing more golf.
```

---

## Apple App Store

**Name** (max 30 chars — 28 used):
```
TapIn Golf: Tee Time Booking
```

**Subtitle** (max 30 chars — 27 used):
```
Book SA golf & keep score
```

**Keywords** (max 100 chars, comma-separated, no spaces — don't repeat words from name/subtitle):
```
tee times,south africa,golf courses,scorecard,handicap,stableford,fourball,club,caddie,green fees
```

**Promotional text** (max 170 chars, editable without review):
```
Book tee times at 500+ South African clubs, split green fees with friends and score your round live — Stableford, medal, match play and more.
```

**Description**: use the Play full description above (drop the emoji headers if preferred).

---

## Screenshot captions (first 3 sell the app)

1. home.png — "Book tee times at 500+ SA clubs"
2. club-detail.png — "Live tee sheet & green fees"
3. scoring.png — "Score every format, hole by hole"
4. friends.png — "Play & split the bill with friends"
5. tournaments.png — "Club comps, draws & leaderboards"

---

## Pre-launch checklist (blockers & quick wins)

- [ ] **Replace test AdMob IDs** in app.json (`ca-app-pub-3940256099942544…` are Google's sample IDs — Play Store will limit/reject ads and it violates AdMob policy in production).
- [ ] Re-take the two failed iOS screenshots (`ios-6_5in`/`ios-6_7in`: explore-failed.png, tournaments-failed.png).
- [ ] Decide on iPad: `supportsTablet` is `false` but iPad Pro 12.9" screenshots exist — either enable tablet support or drop the iPad set.
- [ ] Add a feature graphic for Play (1024×500) — required for the listing.
- [ ] App category: Sports (both stores).
- [ ] Localisation: start with English (South Africa) as primary on Play; consider Afrikaans later for keyword coverage.
- [ ] After launch: reply to every review in the first 90 days and prompt happy users for ratings after a completed round (in-app review API) — rating velocity is the biggest early ranking factor.
```
