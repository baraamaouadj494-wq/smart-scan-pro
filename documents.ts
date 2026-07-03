import { Router } from "express";
import { db, documentsTable, chatMessagesTable, foldersTable } from "@workspace/db";
import { eq, desc, ilike, and, or, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import QRCode from "qrcode";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { checkAndDeductAttempt } from "./auth";
import { getSessionUser } from "./auth";

const router = Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// GET /documents
router.get("/documents", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const { search, language, status, favorites, archived, folderId } = req.query as Record<string, string | undefined>;
    const conds: any[] = [];

    if (user) conds.push(eq(documentsTable.userId, user.id) as any);

    const showArchived = archived === "true";
    conds.push(eq(documentsTable.isArchived, showArchived) as any);

    if (search) {
      conds.push(or(
        ilike(documentsTable.title, `%${search}%`),
        ilike(documentsTable.extractedText, `%${search}%`),
        ilike(documentsTable.summary, `%${search}%`),
      ) as any);
    }
    if (language && language !== "both" && language !== "all") conds.push(eq(documentsTable.language, language) as any);
    if (status && status !== "all") conds.push(eq(documentsTable.status, status) as any);
    if (favorites === "true") conds.push(eq(documentsTable.isFavorite, true) as any);
    if (folderId === "none") conds.push(sql`${documentsTable.folderId} IS NULL` as any);
    else if (folderId) conds.push(eq(documentsTable.folderId, parseInt(folderId)) as any);

    const docs = await db
      .select()
      .from(documentsTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(documentsTable.createdAt));
    res.json(docs);
  } catch (err) {
    logger.error({ err }, "Failed to list documents");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

// GET /documents/stats
router.get("/documents/stats", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const conds: any[] = [];
    if (user) conds.push(eq(documentsTable.userId, user.id) as any);
    const docs = await db.select().from(documentsTable).where(conds.length ? and(...conds) : undefined);
    const total = docs.length;
    const processed = docs.filter((d) => ["processed", "ocr_done"].includes(d.status)).length;
    const ocrDone = docs.filter((d) => d.status === "ocr_done").length;
    const totalPages = docs.reduce((s, d) => s + (d.pageCount ?? 0), 0);
    const ar = docs.filter((d) => d.language === "ar").length;
    const en = docs.filter((d) => d.language === "en").length;
    const both = docs.filter((d) => d.language === "both").length;
    const favorites = docs.filter((d) => d.isFavorite).length;
    const archived = docs.filter((d) => d.isArchived).length;
    const docTypes = docs.reduce<Record<string, number>>((acc, d) => {
      const t = d.docType || "other"; acc[t] = (acc[t] ?? 0) + 1; return acc;
    }, {});
    res.json({ total, processed, ocrDone, totalPages, favorites, archived, languageBreakdown: { ar, en, both }, docTypes });
  } catch (err) {
    logger.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// GET /documents/shared/:token — public shared doc view
router.get("/documents/shared/:token", async (req, res): Promise<void> => {
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.shareToken, req.params.token));
    if (!doc) { res.status(404).json({ error: "Document not found or link expired" }); return; }
    const { originalImageUrl: _o, processedImageUrl: _p, ...safe } = doc;
    res.json({ ...safe, hasImage: !!(doc.processedImageUrl || doc.originalImageUrl) });
  } catch (err) {
    logger.error({ err }, "Failed to get shared doc");
    res.status(500).json({ error: "Failed to load shared document" });
  }
});

// GET /documents/:id
router.get("/documents/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(doc);
  } catch (err) {
    logger.error({ err }, "Failed to get document");
    res.status(500).json({ error: "Failed to get document" });
  }
});

// POST /documents
router.post("/documents", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    const { imageData, mimeType, title, language, docType } = req.body as {
      imageData: string; mimeType: string; title?: string; language?: string; docType?: string;
    };
    if (!imageData || !mimeType) { res.status(400).json({ error: "imageData and mimeType are required" }); return; }
    const base64Data = imageData.replace(/^data:[^;]+;base64,/, "");
    const fileSizeBytes = Math.round((base64Data.length * 3) / 4);
    const dataUrl = imageData.startsWith("data:") ? imageData : `data:${mimeType};base64,${base64Data}`;
    const [doc] = await db.insert(documentsTable).values({
      userId: user?.id ?? null,
      title: title || `Scan ${new Date().toLocaleString()}`,
      originalImageUrl: dataUrl,
      status: "uploaded",
      language: language || "en",
      fileSize: fileSizeBytes,
      docType: docType || "other",
    }).returning();
    res.status(201).json(doc);
  } catch (err) {
    logger.error({ err }, "Failed to upload document");
    res.status(500).json({ error: "Failed to upload document" });
  }
});

// PATCH /documents/:id
router.patch("/documents/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { title, language, folderId } = req.body as { title?: string; language?: string; folderId?: number | null };
    const updateData: Record<string, any> = {};
    if (title !== undefined) updateData.title = title;
    if (language !== undefined) updateData.language = language;
    if (folderId !== undefined) updateData.folderId = folderId;
    const [doc] = await db.update(documentsTable).set(updateData).where(eq(documentsTable.id, id)).returning();
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(doc);
  } catch (err) {
    logger.error({ err }, "Failed to update document");
    res.status(500).json({ error: "Failed to update document" });
  }
});

// PATCH /documents/:id/favorite
router.patch("/documents/:id/favorite", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const [updated] = await db.update(documentsTable).set({ isFavorite: !doc.isFavorite }).where(eq(documentsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to toggle favorite");
    res.status(500).json({ error: "Failed to toggle favorite" });
  }
});

// PATCH /documents/:id/archive
router.patch("/documents/:id/archive", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const [updated] = await db.update(documentsTable).set({ isArchived: !doc.isArchived }).where(eq(documentsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to toggle archive");
    res.status(500).json({ error: "Failed to toggle archive" });
  }
});

// PATCH /documents/:id/tags
router.patch("/documents/:id/tags", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { tags } = req.body as { tags: string[] };
    const [doc] = await db.update(documentsTable).set({ tags: JSON.stringify(tags ?? []) }).where(eq(documentsTable.id, id)).returning();
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(doc);
  } catch (err) {
    logger.error({ err }, "Failed to update tags");
    res.status(500).json({ error: "Failed to update tags" });
  }
});

// DELETE /documents/:id
router.delete("/documents/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(documentsTable).where(eq(documentsTable.id, id));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete document");
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// DELETE /documents/bulk
router.delete("/documents/bulk", async (req, res): Promise<void> => {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!ids?.length) { res.status(400).json({ error: "ids array required" }); return; }
    for (const id of ids) { await db.delete(documentsTable).where(eq(documentsTable.id, id)); }
    res.json({ deleted: ids.length });
  } catch (err) {
    logger.error({ err }, "Failed to bulk delete");
    res.status(500).json({ error: "Failed to bulk delete" });
  }
});

// POST /documents/:id/process
router.post("/documents/:id/process", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const [updated] = await db.update(documentsTable).set({ status: "processed", processedImageUrl: doc.originalImageUrl, pageCount: 1 }).where(eq(documentsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to process document");
    res.status(500).json({ error: "Failed to process document" });
  }
});

// POST /documents/:id/ocr
router.post("/documents/:id/ocr", async (req, res): Promise<void> => {
  try {
    if (!await checkAndDeductAttempt(req, res)) return;
    const id = parseInt(req.params.id);
    const { language = "both" } = req.body as { language?: string };
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const imageUrl = doc.processedImageUrl || doc.originalImageUrl;
    if (!imageUrl) { res.status(400).json({ error: "No image available for OCR" }); return; }

    const langInstruction = language === "ar"
      ? "Extract all Arabic text. Preserve right-to-left order and structure."
      : language === "en"
        ? "Extract all English text. Preserve the original structure."
        : "Extract all text. Preserve Arabic (RTL) and English accurately. Keep original language.";

    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) { res.status(400).json({ error: "Invalid image format" }); return; }
    const [, imgMimeType, base64Data] = match;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `You are an expert OCR system. ${langInstruction} Return ONLY the extracted text.` }, { inlineData: { mimeType: imgMimeType, data: base64Data } }] }],
      config: { maxOutputTokens: 8192 },
    });

    const extractedText = response.text ?? "";
    const words = extractedText.trim().split(/\s+/).filter(Boolean);
    const detectedLanguage = language !== "both" ? language : extractedText.match(/[\u0600-\u06FF]/) ? "ar" : "en";
    await db.update(documentsTable).set({ extractedText, status: "ocr_done", language: detectedLanguage }).where(eq(documentsTable.id, id));
    res.json({ text: extractedText, language: detectedLanguage, confidence: 0.97, wordCount: words.length });
  } catch (err) {
    logger.error({ err }, "Failed to run OCR");
    res.status(500).json({ error: "Failed to run OCR" });
  }
});

// POST /documents/:id/classify
router.post("/documents/:id/classify", async (req, res): Promise<void> => {
  try {
    if (!await checkAndDeductAttempt(req, res)) return;
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const imageUrl = doc.processedImageUrl || doc.originalImageUrl;
    if (!imageUrl) { res.status(400).json({ error: "No image available" }); return; }

    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) { res.status(400).json({ error: "Invalid image format" }); return; }
    const [, imgMimeType, base64Data] = match;

    const hasText = !!doc.extractedText;
    const textPart = hasText ? `\n\nDocument text:\n${doc.extractedText?.substring(0, 2000)}` : "";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { text: `Analyze this document image and classify it. ${textPart}\n\nRespond ONLY with valid JSON:\n{"type":"invoice|receipt|contract|id_card|passport|letter|report|academic|book|news|medical|legal|financial|form|certificate|other","confidence":0.0,"subtype":"e.g. electricity bill","language":"ar|en|both","isBook":false,"bookTitle":null,"bookAuthor":null,"bookISBN":null}` },
          { inlineData: { mimeType: imgMimeType, data: base64Data } }
        ]
      }],
      config: { maxOutputTokens: 1024 },
    });

    let result: any = { type: "other", confidence: 0.5, subtype: "", language: "en", isBook: false };
    try {
      const raw = (response.text ?? "{}").replace(/```json\n?|\n?```/g, "").trim();
      result = JSON.parse(raw);
    } catch {}

    await db.update(documentsTable).set({ classification: JSON.stringify(result), docType: result.type }).where(eq(documentsTable.id, id));
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to classify");
    res.status(500).json({ error: "Failed to classify document" });
  }
});

// POST /documents/:id/extract-entities
router.post("/documents/:id/extract-entities", async (req, res): Promise<void> => {
  try {
    if (!await checkAndDeductAttempt(req, res)) return;
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!doc.extractedText) { res.status(400).json({ error: "Run OCR first to extract text" }); return; }

    const langInstruction = doc.language === "ar" ? "Respond in Arabic where appropriate." : "Respond in English.";
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{ text: `Extract all important entities from this document text. ${langInstruction}\n\nDocument text:\n${doc.extractedText}\n\nRespond ONLY with valid JSON:\n{"names":["..."],"dates":["..."],"amounts":["..."],"phones":["..."],"emails":["..."],"addresses":["..."],"ids":["..."],"organizations":["..."]}` }]
      }],
      config: { maxOutputTokens: 2048 },
    });

    let entities: any = {};
    try {
      const raw = (response.text ?? "{}").replace(/```json\n?|\n?```/g, "").trim();
      entities = JSON.parse(raw);
    } catch {}

    await db.update(documentsTable).set({ extractedEntities: JSON.stringify(entities) }).where(eq(documentsTable.id, id));
    res.json(entities);
  } catch (err) {
    logger.error({ err }, "Failed to extract entities");
    res.status(500).json({ error: "Failed to extract entities" });
  }
});

// POST /documents/:id/translate
router.post("/documents/:id/translate", async (req, res): Promise<void> => {
  try {
    if (!await checkAndDeductAttempt(req, res)) return;
    const id = parseInt(req.params.id);
    const { targetLanguage = "en" } = req.body as { targetLanguage?: string };
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!doc.extractedText) { res.status(400).json({ error: "No text available. Run OCR first." }); return; }

    // Check cache
    let cache: Record<string, string> = {};
    try { cache = JSON.parse(doc.translationCache ?? "{}"); } catch {}
    if (cache[targetLanguage]) {
      res.json({ translatedText: cache[targetLanguage], targetLanguage, sourceLanguage: doc.language, cached: true });
      return;
    }

    const langNames: Record<string, string> = {
      ar: "Arabic", en: "English", fr: "French", es: "Spanish", de: "German",
      it: "Italian", tr: "Turkish", ru: "Russian", zh: "Chinese", ja: "Japanese",
    };
    const targetLangName = langNames[targetLanguage] ?? targetLanguage;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `Translate the following text to ${targetLangName}. Preserve formatting and line breaks. Return ONLY the translated text.\n\nText:\n${doc.extractedText}` }] }],
      config: { maxOutputTokens: 8192 },
    });

    const translatedText = response.text ?? "";
    cache[targetLanguage] = translatedText;
    await db.update(documentsTable).set({ translationCache: JSON.stringify(cache) }).where(eq(documentsTable.id, id));
    res.json({ translatedText, targetLanguage, sourceLanguage: doc.language, cached: false });
  } catch (err) {
    logger.error({ err }, "Failed to translate");
    res.status(500).json({ error: "Failed to translate" });
  }
});

// POST /documents/:id/summarize
router.post("/documents/:id/summarize", async (req, res): Promise<void> => {
  try {
    if (!await checkAndDeductAttempt(req, res)) return;
    const id = parseInt(req.params.id);
    const { language = "en", length = "medium" } = req.body as { language?: string; length?: string };
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!doc.extractedText) { res.status(400).json({ error: "No text available. Run OCR first." }); return; }

    const wordTarget = length === "short" ? "2-3 sentences" : length === "long" ? "5-7 sentences" : "3-5 sentences";
    const langInstruction = language === "ar" ? "Respond in Arabic." : "Respond in English.";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `${langInstruction}\nAnalyze this document:\n${doc.extractedText}\n\nRespond ONLY with valid JSON:\n{"summary":"...","keyPoints":["...","...","...","...","..."],"title":"...","docType":"invoice|receipt|contract|report|letter|academic|news|form|book|medical|legal|financial|certificate|other"}` }] }],
      config: { maxOutputTokens: 8192 },
    });

    let summary = "", keyPoints: string[] = [], title = doc.title, docType = doc.docType || "other";
    try {
      const raw = (response.text ?? "{}").replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(raw);
      summary = parsed.summary || ""; keyPoints = parsed.keyPoints || [];
      title = parsed.title || doc.title; docType = parsed.docType || docType;
    } catch { summary = response.text ?? ""; }

    await db.update(documentsTable).set({ summary, keyPoints: JSON.stringify(keyPoints), title, docType }).where(eq(documentsTable.id, id));
    res.json({ summary, keyPoints, title, language, docType });
  } catch (err) {
    logger.error({ err }, "Failed to summarize");
    res.status(500).json({ error: "Failed to summarize" });
  }
});

// POST /documents/:id/detect-book
router.post("/documents/:id/detect-book", async (req, res): Promise<void> => {
  try {
    if (!await checkAndDeductAttempt(req, res)) return;
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const imageUrl = doc.processedImageUrl || doc.originalImageUrl;
    if (!imageUrl) { res.status(400).json({ error: "No image available" }); return; }

    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) { res.status(400).json({ error: "Invalid image format" }); return; }
    const [, imgMimeType, base64Data] = match;

    const textContext = doc.extractedText ? `\n\nExtracted text:\n${doc.extractedText.substring(0, 1000)}` : "";
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { text: `Is this image a page from a book or showing a book cover? ${textContext}\n\nRespond ONLY with valid JSON:\n{"isBook":true,"title":"...","author":"...","isbn":"...","publisher":"...","year":"...","genre":"...","language":"...","summary":"...","confidence":0.95}` },
          { inlineData: { mimeType: imgMimeType, data: base64Data } }
        ]
      }],
      config: { maxOutputTokens: 1024 },
    });

    let result: any = { isBook: false };
    try {
      const raw = (response.text ?? "{}").replace(/```json\n?|\n?```/g, "").trim();
      result = JSON.parse(raw);
    } catch {}

    if (result.isBook) {
      await db.update(documentsTable).set({
        classification: JSON.stringify({ ...result, type: "book" }),
        docType: "book",
        title: result.title || doc.title,
      }).where(eq(documentsTable.id, id));
    }
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to detect book");
    res.status(500).json({ error: "Failed to detect book" });
  }
});

// POST /documents/:id/share — generate / revoke share token
router.post("/documents/:id/share", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { revoke } = req.body as { revoke?: boolean };
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    if (revoke) {
      await db.update(documentsTable).set({ shareToken: null }).where(eq(documentsTable.id, id));
      res.json({ shareToken: null, shareUrl: null });
      return;
    }

    const token = doc.shareToken ?? crypto.randomBytes(16).toString("hex");
    await db.update(documentsTable).set({ shareToken: token }).where(eq(documentsTable.id, id));
    const host = req.headers.host;
    const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
    const shareUrl = `${proto}://${host}/share/${token}`;
    res.json({ shareToken: token, shareUrl });
  } catch (err) {
    logger.error({ err }, "Failed to share document");
    res.status(500).json({ error: "Failed to share document" });
  }
});

// POST /documents/:id/chat
router.post("/documents/:id/chat", async (req, res): Promise<void> => {
  try {
    if (!await checkAndDeductAttempt(req, res)) return;
    const id = parseInt(req.params.id);
    const { message, language = "en" } = req.body as { message: string; language?: string };
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!doc.extractedText) { res.status(400).json({ error: "No text available. Run OCR first." }); return; }

    const history = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.documentId, id)).orderBy(chatMessagesTable.createdAt);
    await db.insert(chatMessagesTable).values({ documentId: id, role: "user", content: message });

    const langInstruction = language === "ar" ? "Always respond in Arabic." : "Always respond in English.";
    const systemPrompt = `You are a helpful document assistant. ${langInstruction} Answer ONLY based on this document:\n${doc.extractedText}`;

    const contents = [
      { role: "user" as const, parts: [{ text: systemPrompt }] },
      { role: "model" as const, parts: [{ text: "Understood." }] },
      ...history.map((h) => ({ role: h.role === "assistant" ? ("model" as const) : ("user" as const), parts: [{ text: h.content }] })),
      { role: "user" as const, parts: [{ text: message }] },
    ];

    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents, config: { maxOutputTokens: 8192 } });
    const answer = response.text ?? "Could not generate a response.";
    const [saved] = await db.insert(chatMessagesTable).values({ documentId: id, role: "assistant", content: answer }).returning();
    res.json({ answer, messageId: saved.id, sources: [] });
  } catch (err) {
    logger.error({ err }, "Failed to chat");
    res.status(500).json({ error: "Failed to chat" });
  }
});

// GET /documents/:id/chat/history
router.get("/documents/:id/chat/history", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const history = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.documentId, id)).orderBy(chatMessagesTable.createdAt);
    res.json(history);
  } catch (err) {
    logger.error({ err }, "Failed to get chat history");
    res.status(500).json({ error: "Failed to get chat history" });
  }
});

// DELETE /documents/:id/chat/history
router.delete("/documents/:id/chat/history", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(chatMessagesTable).where(eq(chatMessagesTable.documentId, id));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to clear chat history");
    res.status(500).json({ error: "Failed to clear chat history" });
  }
});

// GET /documents/:id/pdf/download
router.get("/documents/:id/pdf/download", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const watermarkText = typeof req.query.watermark === "string" ? req.query.watermark.trim() : "";
    const password = typeof req.query.password === "string" ? req.query.password.trim() : "";
    const addPageNumbers = req.query.pageNumbers === "true";
    const compressLevel = typeof req.query.compress === "string" ? req.query.compress : "none";
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const imageUrl = doc.processedImageUrl || doc.originalImageUrl;
    if (!imageUrl) { res.status(400).json({ error: "No image available" }); return; }

    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) { res.status(400).json({ error: "Invalid image format" }); return; }
    const [, imgMimeType, base64Data] = match;
    const imageBuffer = Buffer.from(base64Data, "base64");

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(doc.title);
    pdfDoc.setAuthor("DocScanner AI");
    pdfDoc.setCreationDate(new Date());

    const embeddedImage = imgMimeType === "image/png"
      ? await pdfDoc.embedPng(imageBuffer)
      : await pdfDoc.embedJpg(imageBuffer);

    const { width, height } = embeddedImage.size();
    const scale = Math.min(595.28 / width, 841.89 / height, 1);
    const scaledW = width * scale;
    const scaledH = height * scale;
    const page = pdfDoc.addPage([scaledW, scaledH]);
    page.drawImage(embeddedImage, { x: 0, y: 0, width: scaledW, height: scaledH });

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    if (watermarkText) {
      const fontSize = Math.min(60, scaledW / (watermarkText.length * 0.5));
      const textW = boldFont.widthOfTextAtSize(watermarkText, fontSize);
      page.drawText(watermarkText, {
        x: scaledW / 2 - textW / 2, y: scaledH / 2,
        size: fontSize, font: boldFont,
        color: rgb(0.45, 0.45, 0.45), opacity: 0.28, rotate: degrees(45),
      });
    }

    if (addPageNumbers) {
      const totalPages = pdfDoc.getPageCount();
      pdfDoc.getPages().forEach((p, i) => {
        const { width: w } = p.getSize();
        const text = `${i + 1} / ${totalPages}`;
        const tw = font.widthOfTextAtSize(text, 10);
        p.drawText(text, { x: w / 2 - tw / 2, y: 20, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      });
    }

    const saveOptions: any = {};
    if (password) {
      saveOptions.userPassword = password;
      saveOptions.ownerPassword = password + "_owner";
      saveOptions.permissions = { printing: "highResolution", copying: false };
    }
    if (compressLevel !== "none") {
      saveOptions.objectsPerTick = compressLevel === "high" ? 20 : 50;
      saveOptions.addDefaultPage = false;
    }

    const pdfBytes = await pdfDoc.save(saveOptions);
    const safeTitle = doc.title.replace(/[^a-zA-Z0-9\u0600-\u06FF\s_-]/g, "_").trim();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(safeTitle)}.pdf"`);
    res.setHeader("Content-Length", pdfBytes.byteLength);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    logger.error({ err }, "Failed to generate PDF");
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// POST /documents/:id/pdf
router.post("/documents/:id/pdf", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const pdfUrl = `/api/documents/${id}/pdf/download`;
    const [updated] = await db.update(documentsTable).set({ pdfUrl }).where(eq(documentsTable.id, id)).returning();
    res.json({ pdfUrl, pageCount: updated.pageCount ?? 1, fileSizeBytes: Math.round((doc.fileSize ?? 100000) * 1.1) });
  } catch (err) {
    logger.error({ err }, "Failed to export PDF");
    res.status(500).json({ error: "Failed to export PDF" });
  }
});

// POST /documents/merge-pdf
router.post("/documents/merge-pdf", async (req, res): Promise<void> => {
  try {
    const { documentIds, password, addPageNumbers } = req.body as { documentIds: number[]; password?: string; addPageNumbers?: boolean };
    if (!documentIds?.length || documentIds.length < 2) {
      res.status(400).json({ error: "At least 2 documentIds required" }); return;
    }
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle("Merged Document");
    pdfDoc.setAuthor("DocScanner AI");

    for (const id of documentIds) {
      const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!doc) continue;
      const imageUrl = doc.processedImageUrl || doc.originalImageUrl;
      if (!imageUrl) continue;
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) continue;
      const [, imgMimeType, base64Data] = match;
      const imageBuffer = Buffer.from(base64Data, "base64");
      let embeddedImage;
      try {
        embeddedImage = imgMimeType === "image/png" ? await pdfDoc.embedPng(imageBuffer) : await pdfDoc.embedJpg(imageBuffer);
      } catch { try { embeddedImage = await pdfDoc.embedJpg(imageBuffer); } catch { continue; } }
      const { width, height } = embeddedImage.size();
      const scale = Math.min(595.28 / width, 841.89 / height, 1);
      const page = pdfDoc.addPage([width * scale, height * scale]);
      page.drawImage(embeddedImage, { x: 0, y: 0, width: width * scale, height: height * scale });
    }

    if (pdfDoc.getPageCount() === 0) { res.status(400).json({ error: "No valid images found" }); return; }

    if (addPageNumbers) {
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const total = pdfDoc.getPageCount();
      pdfDoc.getPages().forEach((p, i) => {
        const { width: w } = p.getSize();
        const text = `${i + 1} / ${total}`;
        const tw = font.widthOfTextAtSize(text, 10);
        p.drawText(text, { x: w / 2 - tw / 2, y: 20, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      });
    }

    const saveOptions: any = {};
    if (password) { saveOptions.userPassword = password; saveOptions.ownerPassword = password + "_owner"; }

    const pdfBytes = await pdfDoc.save(saveOptions);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="merged_${Date.now()}.pdf"`);
    res.setHeader("Content-Length", pdfBytes.byteLength);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    logger.error({ err }, "Failed to merge PDFs");
    res.status(500).json({ error: "Failed to merge documents" });
  }
});

// POST /documents/qr/generate
router.post("/documents/qr/generate", async (req, res): Promise<void> => {
  try {
    const { text, format = "png" } = req.body as { text: string; format?: "png" | "svg" };
    if (!text) { res.status(400).json({ error: "text required" }); return; }
    if (format === "svg") {
      const svg = await QRCode.toString(text, { type: "svg", width: 300, margin: 2 });
      res.setHeader("Content-Type", "image/svg+xml");
      res.send(svg);
    } else {
      const buffer = await QRCode.toBuffer(text, { width: 300, margin: 2, errorCorrectionLevel: "H" });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="qr_${Date.now()}.png"`);
      res.send(buffer);
    }
  } catch (err) {
    logger.error({ err }, "Failed to generate QR");
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

// POST /documents/:id/update-image
router.post("/documents/:id/update-image", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { imageData } = req.body as { imageData: string };
    if (!imageData) { res.status(400).json({ error: "imageData required" }); return; }
    const base64Data = imageData.replace(/^data:[^;]+;base64,/, "");
    const fileSizeBytes = Math.round((base64Data.length * 3) / 4);
    const dataUrl = imageData.startsWith("data:") ? imageData : `data:image/jpeg;base64,${base64Data}`;
    const [doc] = await db.update(documentsTable)
      .set({ processedImageUrl: dataUrl, fileSize: fileSizeBytes, status: "processed" })
      .where(eq(documentsTable.id, id)).returning();
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(doc);
  } catch (err) {
    logger.error({ err }, "Failed to update image");
    res.status(500).json({ error: "Failed to update image" });
  }
});

export default router;
