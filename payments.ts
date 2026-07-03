import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { GoogleGenAI } from "@google/genai";

const router = Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const PACKAGES: Record<string, { attempts: number; amount: number; label: string }> = {
  starter:  { attempts: 50,  amount: 5,  label: "Starter — 50 attempts"   },
  standard: { attempts: 120, amount: 10, label: "Standard — 120 attempts" },
  pro:      { attempts: 300, amount: 20, label: "Pro — 300 attempts"       },
};

const BTC_WALLET  = "bc1qt6xwdylvj2s00ty3e8cdyug50n7etav6qywu62";
const USDT_WALLET = "TMDQE4bbxu2jSugbrNdUKb9jbHQUaAXreE";

// POST /api/payments/submit — store pending TxID (manual fallback)
router.post("/payments/submit", async (req: any, res: any): Promise<void> => {
  try {
    const userId = req.session?.userId;
    if (!userId) { res.status(401).json({ error: "غير مصادق" }); return; }

    const { pkg, reference } = req.body;
    if (!pkg || !reference?.trim()) { res.status(400).json({ error: "الحزمة ورقم الوصل مطلوبان" }); return; }

    const pack = PACKAGES[pkg];
    if (!pack) { res.status(400).json({ error: "حزمة غير صالحة" }); return; }

    await db.execute(
      sql`INSERT INTO payments (user_id, checkout_id, amount, attempts_granted, status)
          VALUES (${userId}, ${"manual_" + Date.now()}, ${pack.amount}, ${pack.attempts}, 'pending')
          ON CONFLICT DO NOTHING`
    );

    logger.info({ userId, pkg, reference }, "Manual payment submitted");
    res.json({ success: true, message: "تم إرسال طلبك، سيتم التحقق خلال 24 ساعة" });
  } catch (err) {
    logger.error({ err }, "Payment submit failed");
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/payments/verify-tx — AI-powered blockchain verification (auto-approve)
router.post("/payments/verify-tx", async (req: any, res: any): Promise<void> => {
  try {
    const userId = req.session?.userId;
    if (!userId) { res.status(401).json({ error: "غير مصادق" }); return; }

    const { txHash, pkg, network } = req.body as { txHash: string; pkg: string; network: "usdt_trc20" | "btc" };
    if (!txHash?.trim() || !pkg || !network) {
      res.status(400).json({ error: "txHash, pkg و network مطلوبة" }); return;
    }

    const pack = PACKAGES[pkg];
    if (!pack) { res.status(400).json({ error: "حزمة غير صالحة" }); return; }

    // Check if already processed
    const existing = await db.execute(
      sql`SELECT status FROM payments WHERE checkout_id = ${txHash} LIMIT 1`
    );
    if ((existing.rows as any[]).some(r => r.status === "paid")) {
      res.status(409).json({ verified: false, reason: "هذه العملية تم التحقق منها مسبقاً" }); return;
    }

    // Fetch blockchain data
    let txData: unknown = null;
    try {
      if (network === "usdt_trc20") {
        const resp = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${encodeURIComponent(txHash)}`, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        txData = await resp.json();
      } else if (network === "btc") {
        const resp = await fetch(`https://blockchain.info/rawtx/${encodeURIComponent(txHash)}`, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        txData = await resp.json();
      }
    } catch (fetchErr) {
      logger.warn({ fetchErr }, "Blockchain API fetch failed");
      res.json({ verified: false, reason: "تعذّر الاتصال بـ blockchain API — تحقق من الهاش أو حاول لاحقاً" });
      return;
    }

    if (!txData) {
      res.json({ verified: false, reason: "لم يتم العثور على المعاملة" });
      return;
    }

    // Ask Gemini to verify
    const targetWallet = network === "btc" ? BTC_WALLET : USDT_WALLET;
    const networkLabel  = network === "btc" ? "Bitcoin (BTC)" : "USDT TRC-20 (Tron)";

    const geminiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `You are a blockchain payment verification AI. Analyze the transaction below.

Expected payment:
- Network: ${networkLabel}
- Required amount: $${pack.amount} USD (or equivalent)
- Recipient wallet: ${targetWallet}
- Package: ${pack.label}

For USDT TRC-20: amount is in atomic units (6 decimals, so $5 = 5000000).
For BTC: amount is in satoshis (1 BTC = 100,000,000 satoshis).
Check if:
1. The recipient address matches (case-insensitive for TRC-20)
2. The amount is sufficient for the package
3. The transaction is confirmed (has block height / confirmed=true)

Transaction data:
${JSON.stringify(txData, null, 2)}

Respond ONLY with valid JSON (no markdown):
{"verified": true/false, "reason": "brief explanation in Arabic", "amountReceived": "formatted amount", "recipientMatches": true/false, "isConfirmed": true/false}`,
        }],
      }],
      config: { maxOutputTokens: 512 },
    });

    let verified = false;
    let reason = "تعذّر التحقق من المعاملة";
    let amountReceived = "";

    try {
      const raw = (geminiResponse.text ?? "{}").replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(raw);
      verified = parsed.verified === true;
      reason = parsed.reason || reason;
      amountReceived = parsed.amountReceived || "";
    } catch {
      reason = geminiResponse.text?.slice(0, 200) ?? reason;
    }

    if (verified) {
      await db.update(usersTable)
        .set({ aiAttempts: sql`${usersTable.aiAttempts} + ${pack.attempts}` })
        .where(eq(usersTable.id, userId));

      await db.execute(
        sql`INSERT INTO payments (user_id, checkout_id, amount, attempts_granted, status)
            VALUES (${userId}, ${txHash}, ${pack.amount}, ${pack.attempts}, 'paid')
            ON CONFLICT (checkout_id) DO UPDATE SET status = 'paid'`
      );

      logger.info({ userId, pkg, txHash, amountReceived }, "Payment auto-verified by AI");
      res.json({ verified: true, reason, attemptsAdded: pack.attempts, amountReceived });
    } else {
      await db.execute(
        sql`INSERT INTO payments (user_id, checkout_id, amount, attempts_granted, status)
            VALUES (${userId}, ${txHash}, ${pack.amount}, ${pack.attempts}, 'pending')
            ON CONFLICT DO NOTHING`
      );
      res.json({ verified: false, reason, amountReceived });
    }
  } catch (err) {
    logger.error({ err }, "Payment verify-tx failed");
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/payments/grant — manual admin grant
router.post("/payments/grant", async (req: any, res: any): Promise<void> => {
  try {
    const { adminSecret, targetUserId, attempts } = req.body;
    if (adminSecret !== process.env.ADMIN_SECRET) { res.status(403).json({ error: "غير مصرح" }); return; }
    if (!targetUserId || !attempts) { res.status(400).json({ error: "targetUserId و attempts مطلوبان" }); return; }

    await db.update(usersTable)
      .set({ aiAttempts: sql`${usersTable.aiAttempts} + ${attempts}` })
      .where(eq(usersTable.id, targetUserId));

    res.json({ success: true, message: `تمت إضافة ${attempts} محاولة للمستخدم ${targetUserId}` });
  } catch (err) {
    logger.error({ err }, "Grant attempts failed");
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
