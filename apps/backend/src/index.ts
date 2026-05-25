import { createApp } from "./app.ts";
import { initializePersistence, resolveBackendPaths } from "./persistence.ts";

const port = Number(process.env.BACKEND_PORT ?? 3001);
const paths = resolveBackendPaths();

async function main(): Promise<void> {
  await initializePersistence(paths);

  const app = createApp({ paths });
  app.listen(port, () => {
    console.log(`backend listening on http://localhost:${port}`);
    console.log(`graph data dir: ${paths.dataDir}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
