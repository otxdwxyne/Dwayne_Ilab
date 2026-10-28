import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { PrismaClient, ClubStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import path from "node:path";
import crypto from "node:crypto";

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === "production";
const PgSession = connectPgSimple(session);

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be set to at least 32 characters.");
}
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: production ? [] : null
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(session({
  name: "jirani.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    tableName: "session"
  }),
  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

declare module "express-session" {
  interface SessionData {
    adminId?: string;
    adminRole?: UserRole;
    csrfToken?: string;
  }
}

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: true, legacyHeaders: false });
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: "Too many submissions. Please try again later." } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: "Too many login attempts. Please wait and try again." } });
app.use("/api", apiLimiter);

const counties = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay","Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
];

const clubSchema = z.object({
  name: z.string().trim().min(3).max(100),
  county: z.enum(counties as [string, ...string[]]),
  town: z.string().trim().min(2).max(80),
  ageGroups: z.string().trim().min(2).max(100),
  contactName: z.string().trim().max(80).optional().or(z.literal("")),
  publicEmail: z.string().trim().email().max(120).optional().or(z.literal("")),
  publicPhone: z.string().trim().max(30).optional().or(z.literal("")),
  website: z.string().trim().url().max(200).optional().or(z.literal("")),
  description: z.string().trim().min(20).max(700),
  consent: z.literal(true)
}).refine(v => Boolean(v.publicEmail || v.publicPhone), {
  message: "Add at least one public contact method.",
  path: ["publicEmail"]
});

const enquirySchema = z.object({
  senderName: z.string().trim().min(2).max(80),
  senderEmail: z.string().trim().email().max(120),
  message: z.string().trim().min(10).max(1000),
  website: z.string().max(0).optional() // honeypot field must stay empty
});

function slugify(value: string) {
  const base = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "football-club";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}
function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
}
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.adminId) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}
function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const sent = req.get("x-csrf-token");
  if (!sent || !req.session.csrfToken || sent !== req.session.csrfToken) {
    return res.status(403).json({ error: "Security token missing or expired. Refresh and try again." });
  }
  next();
}
function publicClub(club: any) {
  return {
    id: club.id, slug: club.slug, name: club.name, sport: "Football",
    county: club.county, town: club.town, ageGroups: club.ageGroups,
    publicEmail: club.publicEmail, publicPhone: club.publicPhone,
    website: club.website, description: club.description,
    featured: club.featured, createdAt: club.createdAt
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "Jirani Play API" }));

app.get("/api/meta", (_req, res) => res.json({ counties, sports: ["Football"] }));

app.get("/api/clubs", asyncRoute(async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  const county = String(req.query.county || "").trim();
  const ageGroup = String(req.query.ageGroup || "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(10000, Number.parseInt(String(req.query.page || "1"), 10) || 1));
  const pageSize = 9;
  const where: any = { status: ClubStatus.APPROVED };
  if (counties.includes(county)) where.county = county;
  if (ageGroup) where.ageGroups = { contains: ageGroup, mode: "insensitive" };
  if (q) where.OR = [
    { name: { contains: q, mode: "insensitive" } },
    { county: { contains: q, mode: "insensitive" } },
    { town: { contains: q, mode: "insensitive" } },
    { description: { contains: q, mode: "insensitive" } }
  ];
  const [clubs, total] = await Promise.all([
    prisma.club.findMany({
      where, orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize, take: pageSize
    }),
    prisma.club.count({ where })
  ]);
  res.json({ clubs: clubs.map(publicClub), total, page, pageSize, pages: Math.ceil(total / pageSize) });
}));

app.get("/api/clubs/:slug", asyncRoute(async (req, res) => {
  const club = await prisma.club.findFirst({ where: { slug: req.params.slug, status: ClubStatus.APPROVED } });
  if (!club) return res.status(404).json({ error: "Club not found." });
  res.json(publicClub(club));
}));

app.post("/api/clubs", submitLimiter, asyncRoute(async (req, res) => {
  const parsed = clubSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please check the form.", details: parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) });
  const body = parsed.data;
  const club = await prisma.club.create({
    data: {
      slug: slugify(body.name), name: body.name, county: body.county,
      town: body.town, ageGroups: body.ageGroups, contactName: body.contactName || null,
      publicEmail: body.publicEmail || null, publicPhone: body.publicPhone || null,
      website: body.website || null, description: body.description,
      status: ClubStatus.PENDING
    }
  });
  res.status(201).json({ message: "Thanks! Your club has been submitted for review.", reference: club.id });
}));

app.post("/api/clubs/:slug/enquiries", submitLimiter, asyncRoute(async (req, res) => {
  const parsed = enquirySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please check your details." });
  if (parsed.data.website) return res.status(400).json({ error: "Unable to process enquiry." });
  const club = await prisma.club.findFirst({ where: { slug: req.params.slug, status: ClubStatus.APPROVED } });
  if (!club) return res.status(404).json({ error: "Club not found." });
  await prisma.clubEnquiry.create({
    data: { clubId: club.id, senderName: parsed.data.senderName, senderEmail: parsed.data.senderEmail, message: parsed.data.message }
  });
  res.status(201).json({ message: "Enquiry received. The club can follow up using the contact details you provided." });
}));

app.get("/api/admin/csrf", requireAdmin, (req, res) => {
  req.session.csrfToken ||= crypto.randomBytes(32).toString("hex");
  res.json({ csrfToken: req.session.csrfToken });
});

app.post("/api/admin/login", loginLimiter, asyncRoute(async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email().max(120), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
  const email = parsed.data.email.toLowerCase();
  const user = await prisma.adminUser.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : await bcrypt.compare(parsed.data.password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid");
  if (!user || !valid) return res.status(401).json({ error: "Email or password is incorrect." });
  await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.adminId = user.id;
  req.session.adminRole = user.role;
  req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  res.json({ message: "Signed in.", email: user.email, role: user.role, csrfToken: req.session.csrfToken });
}));

app.post("/api/admin/logout", requireAdmin, requireCsrf, (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("jirani.sid", { httpOnly: true, secure: production, sameSite: "lax" });
    res.json({ message: "Signed out." });
  });
});

app.get("/api/admin/me", requireAdmin, asyncRoute(async (req, res) => {
  const user = await prisma.adminUser.findUnique({ where: { id: req.session.adminId! }, select: { id: true, email: true, role: true } });
  if (!user) return res.status(401).json({ error: "Please sign in again." });
  res.json(user);
}));

app.get("/api/admin/clubs", requireAdmin, asyncRoute(async (req, res) => {
  const status = String(req.query.status || "PENDING").toUpperCase();
  const allowed = Object.values(ClubStatus);
  const filter = allowed.includes(status as ClubStatus) ? status as ClubStatus : ClubStatus.PENDING;
  const clubs = await prisma.club.findMany({ where: { status: filter }, orderBy: { createdAt: "asc" }, take: 100 });
  res.json({ clubs: clubs.map(c => ({ ...publicClub(c), status: c.status, contactName: c.contactName, reviewedAt: c.reviewedAt })) });
}));

app.patch("/api/admin/clubs/:id", requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const parsed = z.object({
    status: z.enum(["APPROVED", "REJECTED", "PENDING"]).optional(),
    featured: z.boolean().optional()
  }).safeParse(req.body);
  if (!parsed.success || (!parsed.data.status && parsed.data.featured === undefined)) return res.status(400).json({ error: "Provide a valid status or featured value." });
  const existing = await prisma.club.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Club not found." });
  const updated = await prisma.club.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      reviewedAt: parsed.data.status ? new Date() : undefined,
      reviewedBy: parsed.data.status ? req.session.adminId : undefined
    }
  });
  res.json({ club: { ...publicClub(updated), status: updated.status } });
}));

app.delete("/api/admin/clubs/:id", requireAdmin, requireCsrf, asyncRoute(async (req, res) => {
  const existing = await prisma.club.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Club not found." });
  await prisma.club.delete({ where: { id: existing.id } });
  res.json({ message: "Club deleted." });
}));

const publicDir = path.resolve(__dirname, "../public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again later." });
});

app.listen(PORT, () => console.log(`Jirani Play running on http://localhost:${PORT}`));
