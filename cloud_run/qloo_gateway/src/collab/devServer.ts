// DEV/TEST ONLY: the collab routes and the saved-tours routes alone over in-memory stores, for local screenshots and e2e (see dashboard COLLAB_FAKE).
// Never deployed: the Dockerfile starts dist/server.js. Run: node dist/collab/devServer.js (PORT, default 8094).
import express from "express";
import { mountCollab } from "./routes.js";
import { MemoryCollabStore } from "./store.js";
import { mountTours, TOURS_JSON_LIMIT } from "../tours/routes.js";
import { MemoryToursStore } from "../tours/store.js";

const app = express();
app.use("/v1/tours", express.json({ limit: TOURS_JSON_LIMIT }));
app.use(express.json({ limit: "16kb" }));
mountCollab(app, { store: new MemoryCollabStore(), createsPerHour: 1000, wsWritesPerMin: 1000, sessionWritesPerMin: 1000 });
mountTours(app, { store: new MemoryToursStore(), ownersPerHour: 1000 });
const port = Number(process.env.PORT ?? 8094);
app.listen(port, "127.0.0.1", () => console.log(`collab dev server (in memory: workspaces + saved tours) on 127.0.0.1:${port}`));
