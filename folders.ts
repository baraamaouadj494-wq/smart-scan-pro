import { Router } from "express";
import { db, foldersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "./auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /folders
router.get("/folders", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const folders = await db.select().from(foldersTable).where(eq(foldersTable.userId, user.id));
    res.json(folders);
  } catch (err) {
    logger.error({ err }, "Failed to list folders");
    res.status(500).json({ error: "Failed to list folders" });
  }
});

// POST /folders
router.post("/folders", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const { name, color, icon } = req.body as { name: string; color?: string; icon?: string };
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const [folder] = await db.insert(foldersTable).values({ userId: user.id, name, color: color ?? "#6366f1", icon: icon ?? "folder" }).returning();
    res.status(201).json(folder);
  } catch (err) {
    logger.error({ err }, "Failed to create folder");
    res.status(500).json({ error: "Failed to create folder" });
  }
});

// PATCH /folders/:id
router.patch("/folders/:id", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const id = parseInt(req.params.id);
    const { name, color, icon } = req.body;
    const [folder] = await db.update(foldersTable)
      .set({ name, color, icon })
      .where(and(eq(foldersTable.id, id), eq(foldersTable.userId, user.id)))
      .returning();
    if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }
    res.json(folder);
  } catch (err) {
    logger.error({ err }, "Failed to update folder");
    res.status(500).json({ error: "Failed to update folder" });
  }
});

// DELETE /folders/:id
router.delete("/folders/:id", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const id = parseInt(req.params.id);
    await db.delete(foldersTable).where(and(eq(foldersTable.id, id), eq(foldersTable.userId, user.id)));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete folder");
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

export default router;
