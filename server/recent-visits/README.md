# Recent visits

This service reads the last five pageviews for a published note from a self-hosted GoatCounter PostgreSQL database (schema verified against v2.7.0). Configure one instance for a GoatCounter site dedicated to a single publisher and share host. GoatCounter stores requests by path, so a shared site with overlapping paths across hosts cannot attribute those legacy rows to an individual host.

1. In GoatCounter, enable **Settings → Data collection → Individual pageviews**. Enable location, region and operating-system collection for these fields. Province-level coverage depends on the configured GeoIP database and collected regions. Existing aggregates cannot be converted to individual pageviews.
2. Create a read-only PostgreSQL login and grant it `CONNECT` on the GoatCounter database, `USAGE` on its schema and `SELECT` on `paths`, `hits`, `locations` and `systems`. Set `DATABASE_URL` for that login, `GOATCOUNTER_SITE_ID` to the numeric site ID, `SHARE_HOST` to the exact hostname used by the published links and `RECENT_VISITS_TOKEN` to a secret generated with `openssl rand -hex 32`.
3. Run the service with `go run .`, or build the included Docker image with this directory as its context. The binary listens on `127.0.0.1:8787` by default. The container listens on port `8787` and should be reachable only from the reverse proxy or a loopback port mapping.
4. Add an exact route on the HTTPS GoatCounter host. Point `proxy_pass` to the service's internal address. Forward the caller's authorization header.

   ```nginx
   location = /api/v0/recent-visits {
       proxy_pass http://127.0.0.1:8787;
       proxy_set_header Authorization $http_authorization;
   }
   ```

5. In Link Trace's **Share Analytics** settings, enter the site's GoatCounter tracking URL and the same token. Obsidian stores the token in SecretStorage. Expand the share popover on a published note to fetch the latest records.
