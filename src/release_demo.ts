import { ReleaseLedger } from "./release_split.js";

const userId = process.argv[2];
if (!userId) throw new Error("Run npm run demo -- <user_id>");

const ledger = new ReleaseLedger();
ledger.recordBuild({ user_id: userId, build_id: "build-1042", tool: "cli", result: "passed" });
const release = await ledger.release({
  operation_id: "release-build-1042",
  user_id: userId,
  build_id: "build-1042",
  experiment_key: "compiler-diagnostics-v2",
});
console.log(JSON.stringify(release, null, 2));
