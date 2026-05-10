# @userigor/core

The engine behind [userigor](https://github.com/Dragoon0x/userigor) — a telemetry-driven AI coding loop. Capture corrections, embed and cluster them into patterns, inject patterns as context before generation, measure outcomes.

```bash
npm install @userigor/core
```

## Quick start

```ts
import { Rigor } from '@userigor/core';

const rigor = new Rigor({ dbPath: '~/.rigor/data.db' });
rigor.init();

// Capture a correction
await rigor.capture({
  before: 'const data = response.json();',
  after:  'const userProfile = response.json();',
  repo: 'my-app',
  file_path: 'src/api/users.ts',
  agent: 'claude-code',
  task_description: 'rename data to domain term'
});

// Form clusters
rigor.cluster();

// Pre-flight: get patterns for a new prompt
const result = await rigor.inject('rename data variable in this file');
console.log(result.augmented_prompt);

// Honest measurements
console.log(rigor.metrics());

rigor.close();
```

## Modules

```ts
import { Rigor }                       from '@userigor/core';
import { SqliteStore }                 from '@userigor/core/store';
import { HybridTfIdfProvider,
         OpenAIEmbeddingProvider,
         cosineSimilarity }            from '@userigor/core/embed';
import { buildCorrection, GitClient }  from '@userigor/core/capture';
import { clusterCorrections }          from '@userigor/core/cluster';
import { computeMetrics, prunePatterns,
         computePatternImpact,
         timeSeries }                  from '@userigor/core/metrics';
import { injectContext }               from '@userigor/core/inject';
```

## Pluggable embeddings

```ts
import { Rigor, OpenAIEmbeddingProvider } from '@userigor/core';

const rigor = new Rigor({
  embedder: new OpenAIEmbeddingProvider({ model: 'text-embedding-3-small' })
});
```

The default `HybridTfIdfProvider` requires no API key and produces 256-dim dense vectors via TF-IDF over word tokens plus 3-4 char n-grams. Adequate for most repos.

## Pluggable storage

```ts
import { Rigor } from '@userigor/core';
import type { Store } from '@userigor/core';

class MyStore implements Store {
  // …
}

const rigor = new Rigor({ store: new MyStore() });
```

The default is SQLite via `better-sqlite3`. Vectors are stored as Float32 BLOBs; cosine similarity is computed in JS. For collections beyond ~50k corrections, swap to a vec-aware backend.

## License

MIT · [Dragoon0x](https://github.com/Dragoon0x)
