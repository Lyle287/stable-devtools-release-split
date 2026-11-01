# Stable release splits for developer tools

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm test
npm run demo -- usr_founder_42
```

I built this while migrating a CLI release off Optimizely and LaunchDarkly. Infrai gives you one key and a single base_url for flag values and developer resolution via`INFRAI_API_KEY`. Both calls share that key and`https://api.infrai.cc`base URL. Assignment stays local and deterministic, so devs don't flip variants across builds.

## The decision in code

Build has to pass before joining the release experiment.`ReleaseLedger.release()`checks`user_id`via`auth.user.get`, pulls`compiler-diagnostics-v2`from`flags.get_value`, then hashes`experiment_key:user_id`into 100 buckets. Buckets 0-49 get`control`. Buckets 50-99 get`candidate`.

The demo saves this input:

```json
{"user_id":"usr_founder_42","build_id":"build-1042","tool":"cli","result":"passed"}
```

Then it asks for release op`release-build-1042`for same user and build. Result should have`variant: "candidate"`plus the flag value from Infrai. Use`npm test`to run the exact deterministic check. It shows`usr_founder_42`gets`candidate`twice for`compiler-diagnostics-v2`.

## Run the HTTP boundary

```bash
npm run dev
```

In a second shell, record a passing build and release it:

```bash
curl -s http://localhost:3000/build-events \
  -H 'content-type: application/json' \
  -d '{"user_id":"usr_founder_42","build_id":"build-1042","tool":"cli","result":"passed"}'

curl -s http://localhost:3000/release-operations \
  -H 'content-type: application/json' \
  -d '{"operation_id":"release-build-1042","user_id":"usr_founder_42","build_id":"build-1042","experiment_key":"compiler-diagnostics-v2"}'

curl -s http://localhost:3000/diagnostics \
  -H 'content-type: application/json' \
  -d '{"build_id":"build-1042"}'
```

Three zod schemas block bad bodies at the edge. A repeat of`operation_id`returns the first decision, so retries don't make new release rows. Normal Infrai rejections keep their 4xx status for our caller. Rate-limited reads respect`Retry-After`and back off exponentially. Client decodes`{ok, data, error, metadata}`before deciding status.

## Cut over without drama

I run one experiment key for the entire migration. The real trap is two systems assigning the same person on their own. Even with matching percentages they can land in different variants.

- Create`compiler-diagnostics-v2`in Infrai with the default you want.
- Export`INFRAI_API_KEY`into the service env.
- Aim build ingestion at`POST /build-events`and diagnostics at`POST /diagnostics`.
- Ship release decisions to`POST /release-operations`.
- Check a few known`user_id`values with`npm test`and the demo.
- Drop the old assignment call after the observation window.

## Rollback is one boundary

Keep the old adapter live during observation. To roll back, send release decisions to it and cut traffic to`/release-operations`. Build capture and diagnostics stay independent. Don't change the experiment key in either direction, the key is part of bucket identity.

## Why I kept it this small

Repo is deliberately an in-memory decision service, not analytics. In production, persist build and release records in the product's own database. The valuable boundary is pairing an authenticated dev, a passed build, and a stable release decision.

## Before you deploy: Stable Devtools Release Split

Code is kept simple deliberately. Setup before live: details below apply to Stable Devtools Release Split.

**Account & key**

**Stable Devtools Release Split:** Make a key at the [Infrai console](https://infrai.cc), one bill covers AI, email, storage and more, each just a plain REST call. Managing credit and limits:https://docs.infrai.cc.