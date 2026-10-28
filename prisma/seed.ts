import "dotenv/config";
import { PrismaClient, ClubStatus, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const demoClubs = [
  {
    slug: "eastlands-rising-stars",
    name: "Eastlands Rising Stars FC",
    county: "Nairobi",
    town: "Kayole",
    ageGroups: "U13, U15, U17",
    publicEmail: "eastlands@example.org",
    description: "A community football programme helping young players grow through coaching, teamwork and local tournaments.",
    status: ClubStatus.APPROVED,
    featured: true
  },
  {
    slug: "mombasa-coast-queens",
    name: "Mombasa Coast Queens FC",
    county: "Mombasa",
    town: "Likoni",
    ageGroups: "U15, U18, Seniors",
    publicEmail: "coastqueens@example.org",
    description: "A girls and women’s football club building confidence, skills and opportunities on the coast.",
    status: ClubStatus.APPROVED
  },
  {
    slug: "kisumu-lakeside-fc",
    name: "Kisumu Lakeside FC",
    county: "Kisumu",
    town: "Kondele",
    ageGroups: "U16, U18",
    publicEmail: "lakeside@example.org",
    description: "Youth football training, school outreach and weekend community games.",
    status: ClubStatus.APPROVED
  },
  {
    slug: "nakuru-community-united",
    name: "Nakuru Community United",
    county: "Nakuru",
    town: "Nakuru Town",
    ageGroups: "U14, U18, Seniors",
    publicEmail: "communityunited@example.org",
    description: "An inclusive local club focused on football fundamentals, discipline and preparing players for community competitions.",
    status: ClubStatus.APPROVED
  },
  {
    slug: "eldoret-valley-fc",
    name: "Eldoret Valley FC",
    county: "Uasin Gishu",
    town: "Eldoret",
    ageGroups: "U15, U18",
    publicEmail: "valleyfc@example.org",
    description: "Grassroots football sessions that put teamwork, fitness and player development first.",
    status: ClubStatus.APPROVED
  }
];

async function main() {
  for (const club of demoClubs) {
    await prisma.club.upsert({
      where: { slug: club.slug },
      update: {},
      create: club
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password && !password.startsWith("replace-this")) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.adminUser.upsert({
      where: { email: email.toLowerCase() },
      update: {},
      create: { email: email.toLowerCase(), passwordHash, role: UserRole.ADMIN }
    });
    console.log(`Seed admin ensured: ${email.toLowerCase()}`);
  } else {
    console.log("Admin user not seeded. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.");
  }
}
main().finally(() => prisma.$disconnect());