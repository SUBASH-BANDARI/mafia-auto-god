# Mafia Auto-God (MVP)

Playable tonight: create/join rooms, anonymous players, random roles (sqrt mafia), night/day actions, win checks. Material UI. Firebase (Firestore + Anonymous Auth).

## Quick Start

1. **Clone & install**
```bash
npm i
```

2. **Create Firebase project**
   - Enable **Firestore**
   - Enable **Authentication → Anonymous**
   - Project Settings → Web App → copy config

3. **Env**
   - Copy `.env.example` to `.env` and fill values.

4. **Firestore Rules (MVP)**
   - In Firebase Console → Firestore → Rules → paste `firestore.rules`

5. **Run locally**
```bash
npm run dev
```

6. **Deploy to Cloudflare Pages**
   - Push this repo to GitHub.
   - In Cloudflare Pages: New Project → connect repo.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Create environment variables (build): the same four `VITE_FB_*` keys.

## Notes

- Tonight we keep rules permissive for speed (only self-read on player doc). Tighten later.
- Roles: Mafia, Villager, Police, Healer
- Role distribution: 4 players (1 mafia, 1 villager, 1 police, 1 healer), 5-8 players (2 mafia, rest villagers, 1 police, 1 healer), 9+ players (3 mafia, rest villagers, 1 police, 1 healer)
- Police can guess who is mafia during day phase (for their reference)
- Healer can save one person each night
- Host resolves phases via buttons; timers can be added later.
- No role reveal on death (per your choice).
