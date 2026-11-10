# Saravana Q4 Meeting - Actions

A shared tracker for the actions from the Saravana Q4 2026 marketing review. Anyone with the link can set an owner and status on each activity and add comments.

## How it works

- `index.html` is the whole front end (Document360 branding, light and dark mode). It reads and writes through `/api/state` and refreshes every few seconds.
- `api/state.js` is a Vercel serverless function that stores data in Upstash Redis through its REST API. It has no npm dependencies.
- On first load the store is seeded with the statuses and notes from the meeting.

## Setup on Vercel

1. Import this repository as a new Vercel project (no build settings needed).
2. In the project, open **Storage**, add an **Upstash for Redis** database and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Redeploy.

## Notes

- There's no sign-in. Anyone with the URL can change statuses, owners and comments.
- To change the activity list, edit the `DATA` array in `index.html`. Item ids are `s<theme>-<position>`, so add new items at the end of a theme to keep existing statuses attached.
