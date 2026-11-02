# 来追剧呀

Watch series with friends: create a room per series, tick the episodes you've watched, and see how far everyone has got.

- **Stack**: Next.js (static export) + Supabase, same setup as Spello.
- **Supabase project**: `laizhuiju` (ref `mjsgcvuyousczqexxszs`), region Southeast Asia (Singapore). Anonymous sign-ins are on, so nobody needs an account; each device gets its own anonymous user and only picks a nickname.
- **Database**: `supabase/migrations/20261102120000_rooms.sql` (already applied). Tables `rooms` and `members`. Row Level Security means people can only change their own progress.
- **All database calls** are in `lib/api.ts`, so moving to another backend later only touches that file.

## Run locally

```bash
npm install
BASE_PATH='' npm run dev     # http://localhost:3000
```

## Deploy

`npm run build` exports to `out/` with base path `/laizhuiju` for GitHub Pages
(https://evecui250.github.io/laizhuiju/). For TestFlight, add Capacitor the
same way as Spello (`capacitor.config.ts` with `server.url` pointing to the Pages URL).

## Not in v1 yet

Per-episode discussion with spoiler lock, sharing/inviting, real accounts, editing a room's episode count.
