import { Router } from "express";
import { db, vocabularyTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "./auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /vocabulary
router.get("/vocabulary", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const words = await db.select().from(vocabularyTable)
      .where(eq(vocabularyTable.userId, user.id))
      .orderBy(vocabularyTable.createdAt);
    res.json(words.reverse());
  } catch (err) {
    logger.error({ err }, "Failed to list vocabulary");
    res.status(500).json({ error: "Failed to list vocabulary" });
  }
});

// POST /vocabulary
router.post("/vocabulary", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const { word, translation, language, notes } = req.body;
    if (!word) { res.status(400).json({ error: "word required" }); return; }
    const [entry] = await db.insert(vocabularyTable).values({
      userId: user.id, word, translation, language: language ?? "en", notes,
    }).returning();
    res.status(201).json(entry);
  } catch (err) {
    logger.error({ err }, "Failed to add vocabulary" );
    res.status(500).json({ error: "Failed to add word" });
  }
});

// PATCH /vocabulary/:id
router.patch("/vocabulary/:id", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const id = parseInt(req.params.id);
    const { translation, notes } = req.body;
    const [entry] = await db.update(vocabularyTable)
      .set({ translation, notes })
      .where(and(eq(vocabularyTable.id, id), eq(vocabularyTable.userId, user.id)))
      .returning();
    if (!entry) { res.status(404).json({ error: "Word not found" }); return; }
    res.json(entry);
  } catch (err) {
    logger.error({ err }, "Failed to update vocabulary");
    res.status(500).json({ error: "Failed to update word" });
  }
});

// DELETE /vocabulary/:id
router.delete("/vocabulary/:id", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const id = parseInt(req.params.id);
    await db.delete(vocabularyTable).where(and(eq(vocabularyTable.id, id), eq(vocabularyTable.userId, user.id)));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete vocabulary");
    res.status(500).json({ error: "Failed to delete word" });
  }
});

export default router;
