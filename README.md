# ShipTracker

Live table (and map) of the ships around any GPS position, built only on free services.

| Need | Service |
|---|---|
| Live AIS positions | [aisstream.io](https://aisstream.io) (free API key) |
| Place search | OpenStreetMap Nominatim |
| Map tiles | Esri World Gray Canvas + OpenSeaMap seamarks |
| Flags | flagcdn.com |

## Setup

1. Get a free API key at <https://aisstream.io> (sign in with GitHub → *API Keys*).
2. Copy `.env.example` to `.env` and paste the key into `AISSTREAM_API_KEY`.
3. Install and run:

```sh
npm install
npm run dev
```

Open <http://localhost:5173>.

For a production-style run: `npm run build && npm start`, then open <http://localhost:3001>.

## Deploy (Render)

The included [render.yaml](render.yaml) deploys the app as a single free Render web service. The Node server serves the page, the API and the `/live` WebSocket.

1. Push this folder to a GitHub repository. `.env` is ignored, so your key stays private.
2. On [render.com](https://render.com), choose **New → Blueprint** and pick the repository.
3. Paste your aisstream key when asked for `AISSTREAM_API_KEY`, then click **Apply**.

The app is then live at `https://shiptracker-xxxx.onrender.com`. Free instances sleep after 15 minutes without visitors, and the next visit takes about a minute to wake them up.

Any other host that keeps a Node process running with WebSocket support works too (Fly.io, Koyeb, a VPS). Build with `npm install --include=dev && npm run build`, start with `npm start`, and set `AISSTREAM_API_KEY`.

## How it works

aisstream.io doesn't accept connections straight from a browser, because the browser would expose your API key. A small Node relay (`server/`) does three things:

- It holds the key and opens one upstream WebSocket per browser tab, subscribed to a bounding box around the chosen point.
- It parses AIS position and static-data messages, caches ship names and types, and sends batched updates to the browser every 500 ms over `/live`.
- It forwards place searches to Nominatim, with caching and a limit of 1 request per second.

The React app (`web/`) merges updates by MMSI and keeps only ships within the exact radius. It drops ships that haven't been seen for 15 minutes.

## Usage tips

- Search a place, paste `lat, lon`, use **My location**, or double-click the map.
- The URL holds the current point and radius (`?lat=…&lon=…&r=…`), so you can share it.
- Ship names and types arrive in separate AIS messages, sent every ~6 minutes, so new ships can show as *Unnamed* or *Unknown* at first.
- Coverage comes from volunteer receivers, so it's dense near busy coasts and ports and sparse in open ocean.
