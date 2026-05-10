# Cognitive Capacity Planner

A competition MVP that plans study work around a cognitive capacity curve built from:

- Process S: sleep pressure
- Process C: circadian rhythm
- Caffeine pharmacokinetics
- Google Calendar availability through OAuth + OpenAI MCP connector
- Supabase storage

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.example` to `.env.local` and fill the secret values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
APP_URL=http://localhost:3000
```

The anon key can be public. The service role key, Google client secret, and OpenAI key must stay private.

## Supabase

Run `supabase/schema.sql` in the Supabase SQL Editor. Enable anonymous sign-ins in Supabase Auth before testing.

## Google OAuth

Enable Google Calendar API in Google Cloud and add this redirect URI to the web OAuth client:

```text
http://localhost:3000/api/auth/google/callback
```

The app requests:

```text
https://www.googleapis.com/auth/calendar.events
```

## Agent Flow

1. The browser starts an anonymous Supabase session.
2. The user connects Google Calendar with OAuth.
3. Google tokens are stored server-side in Supabase.
4. The user adds sleep, caffeine, and tasks.
5. `/api/agent/schedule` refreshes the Google access token and calls OpenAI Responses API with the Google Calendar MCP connector.
6. The agent returns schedule blocks, which are stored in Supabase and shown on the curve.
