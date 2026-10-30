// DEV/TEST ONLY: the collab routes alone over an in-memory store, for local screenshots (see dashboard COLLAB_FAKE).
// Never deployed: the Dockerfile starts dist/server.js. Run: node dist/collab/devServer.js (PORT, default 8094).
import express from "express";
import { mountCollab } from "./routes.js";
import { MemoryCollabStore } from "./store.js";

const app = express();
app.use(express.json({ limit: "16kb" }));
mountCollab(app, { store: new MemoryCollabStore(), createsPerHour: 1000, wsWritesPerMin: 1000, sessionWritesPerMin: 1000 });
const port = Number(process.env.PORT ?? 8094);
app.listen(port, "127.0.0.1", () => console.log(`collab dev server (in memory) on 127.0.0.1:${port}`));
