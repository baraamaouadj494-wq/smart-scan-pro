import { Router, type Request, type Response } from "express";
import { db, usersTable, sessionsTable, loginHistoryTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

const hashPassword = (p: string) => crypto.createHash("sha256").update(p).digest("hex");

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function getSessionUser(req: Request) {
  const sessionId = req.cookies?.session_id;
  if (!sessionId) return null;
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session || session.expiresAt < new Date()) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  return user ?? null;
}

export async function checkAndDeductAttempt(req: Request, res: Response): Promise<boolean> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated. Please login." });
    return false;
  }
  if (user.aiAttempts <= 0) {
    res.status(403).json({ error: "no_attempts", message: "No AI attempts remaining. Buy more in your profile!" });
    return false;
  }
  await db.update(usersTable)
    .set({ aiAttempts: sql`${usersTable.aiAttempts} - 1` })
    .where(eq(usersTable.id, user.id));
  return true;
}

function serializeUser(user: typeof usersTable.$inferSelect, referralCount: number) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    aiAttempts: user.aiAttempts,
    referralCode: user.referralCode,
    referralCount,
  };
}

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  try {
    const { username, email, password, referralCode: refCode } = req.body;
    if (!username || !password) { res.status(400).json({ error: "Username and password are required" }); return; }
    if (!email || !email.includes("@")) { res.status(400).json({ error: "Valid email is required" }); return; }
    if (username.length < 3) { res.status(400).json({ error: "Username must be at least 3 characters" }); return; }
    if (password.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }

    let referredById: number | null = null;
    let bonusAttempts = 0;

    if (refCode) {
      const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, refCode));
      if (referrer) {
        referredById = referrer.id;
        bonusAttempts = 20;
        await db.update(usersTable)
          .set({ aiAttempts: sql`${usersTable.aiAttempts} + 20` })
          .where(eq(usersTable.id, referrer.id));
      }
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    let myCode = generateReferralCode();
    let attempts = 0;
    while (attempts < 5) {
      try {
        const [newUser] = await db.insert(usersTable).values({
          username,
          email: email.toLowerCase().trim(),
          emailVerified: false,
          verificationCode: otp,
          verificationCodeExpiry: otpExpiry,
          passwordHash: hashPassword(password),
          aiAttempts: 20 + bonusAttempts,
          referralCode: myCode,
          referredBy: referredById ?? undefined,
        }).returning();

        // In production wire up email service here
        // For now, return code in response (dev mode)
        res.status(201).json({
          success: true,
          requiresVerification: true,
          userId: newUser.id,
          email: newUser.email,
          // DEV ONLY — remove in production when email service is wired up
          devCode: otp,
          bonus: bonusAttempts,
        });
        return;
      } catch (err: any) {
        if (err.code === "23505" && err.constraint?.includes("referral_code")) {
          myCode = generateReferralCode(); attempts++;
        } else if (err.code === "23505" && err.constraint?.includes("email")) {
          res.status(400).json({ error: "Email already registered" }); return;
        } else if (err.code === "23505") {
          res.status(400).json({ error: "Username already exists" }); return;
        } else {
          throw err;
        }
      }
    }
    res.status(500).json({ error: "Registration failed" });
  } catch {
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /auth/verify-email
router.post("/auth/verify-email", async (req, res): Promise<void> => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) { res.status(400).json({ error: "userId and code required" }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(userId)));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.emailVerified) { res.status(400).json({ error: "Email already verified" }); return; }
    if (user.verificationCode !== code) { res.status(400).json({ error: "Invalid verification code" }); return; }
    if (user.verificationCodeExpiry && user.verificationCodeExpiry < new Date()) {
      res.status(400).json({ error: "Verification code expired. Please request a new one." }); return;
    }

    await db.update(usersTable)
      .set({ emailVerified: true, verificationCode: null, verificationCodeExpiry: null })
      .where(eq(usersTable.id, user.id));

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    await db.insert(sessionsTable).values({ id: sessionId, userId: user.id, expiresAt });
    res.cookie("session_id", sessionId, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", expires: expiresAt, path: "/",
    });

    const referralCount = await db.$count(usersTable, eq(usersTable.referredBy, user.id));
    res.json({ success: true, user: serializeUser({ ...user, emailVerified: true }, referralCount) });
  } catch {
    res.status(500).json({ error: "Verification failed" });
  }
});

// POST /auth/resend-verification
router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  try {
    const { userId } = req.body;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(userId)));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.emailVerified) { res.status(400).json({ error: "Already verified" }); return; }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await db.update(usersTable)
      .set({ verificationCode: otp, verificationCodeExpiry: otpExpiry })
      .where(eq(usersTable.id, user.id));

    res.json({ success: true, devCode: otp });
  } catch {
    res.status(500).json({ error: "Failed to resend code" });
  }
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    const { email, username, password } = req.body;
    if (!password) { res.status(400).json({ error: "Password required" }); return; }

    let user: typeof usersTable.$inferSelect | undefined;
    if (email) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    } else if (username) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    }

    if (!user || user.passwordHash !== hashPassword(password)) {
      res.status(401).json({ error: "Invalid credentials" }); return;
    }
    if (!user.emailVerified) {
      res.status(403).json({ error: "email_not_verified", userId: user.id, email: user.email });
      return;
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    await db.insert(sessionsTable).values({ id: sessionId, userId: user.id, expiresAt });

    // Log login history
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? null;
    const ua = req.headers["user-agent"] ?? null;
    await db.insert(loginHistoryTable).values({ userId: user.id, ip, userAgent: ua });

    res.cookie("session_id", sessionId, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", expires: expiresAt, path: "/",
    });

    const referralCount = await db.$count(usersTable, eq(usersTable.referredBy, user.id));
    res.json({ success: true, user: serializeUser(user, referralCount) });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const referralCount = await db.$count(usersTable, eq(usersTable.referredBy, user.id));
    res.json({ user: serializeUser(user, referralCount) });
  } catch {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// POST /auth/logout
router.post("/auth/logout", async (req, res): Promise<void> => {
  const sessionId = req.cookies?.session_id;
  if (sessionId) { await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId)).catch(() => {}); }
  res.clearCookie("session_id");
  res.json({ success: true });
});

// GET /auth/login-history
router.get("/auth/login-history", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const history = await db.select().from(loginHistoryTable)
      .where(eq(loginHistoryTable.userId, user.id))
      .orderBy(loginHistoryTable.createdAt)
      .limit(20);
    res.json(history.reverse());
  } catch {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// POST /auth/change-password
router.post("/auth/change-password", async (req, res): Promise<void> => {
  try {
    const user = await getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const { currentPassword, newPassword } = req.body;
    if (user.passwordHash !== hashPassword(currentPassword)) {
      res.status(400).json({ error: "Current password is incorrect" }); return;
    }
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters" }); return;
    }
    await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) }).where(eq(usersTable.id, user.id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
