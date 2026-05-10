# @userigor/dashboard

Local web console for [userigor](https://github.com/Dragoon0x/userigor). A single-page dashboard at `localhost:7717` that reads metrics, patterns, time-series, and status straight from your local SQLite database.

```bash
npm install -g @userigor/dashboard
rigor-dashboard
```

Then open http://127.0.0.1:7717.

## Tabs

- **Overview** — current snapshot of the six metrics, with sparkline-style indicators
- **Patterns** — sortable list of all patterns; click a row for full causal evidence (FTA with vs without injection)
- **Time Series** — daily time-series chart for any metric over 7 / 14 / 30 / 90 days
- **Status** — runtime configuration: db path, agent, repo, counts

## Flags

```bash
rigor-dashboard --port 8080
rigor-dashboard --host 0.0.0.0     # expose to LAN
rigor-dashboard --db /path/to/db
```

Default host is `127.0.0.1`. Localhost-only by design.

## Programmatic

```ts
import { startServer } from '@userigor/dashboard';

const running = await startServer({ port: 8080 });
console.log('listening at', running.url);

// later:
await running.close();
```

## API endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/status` | counts, agent, repo, db path |
| GET | `/api/metrics?since=&until=` | full metrics snapshot |
| GET | `/api/series?name=&days=` | time-series for one metric |
| GET | `/api/patterns?status=&limit=` | array of patterns |
| GET | `/api/patterns/<id-or-name>` | one pattern + causal evidence |

JSON over HTTP. CORS allows any origin.

## License

MIT · [Dragoon0x](https://github.com/Dragoon0x)
