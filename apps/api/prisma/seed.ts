import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const phoneNumber = "+15555550100";
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  await prisma.user.deleteMany({ where: { phoneNumber } });

  const user = await prisma.user.create({
    data: {
      phoneNumber,
      timezone: "America/Los_Angeles",
      checkInHour: 8,
      toneMode: "gen_z",
    },
  });

  await prisma.contact.createMany({
    data: [
      {
        userId: user.id,
        name: "Mom",
        relationshipType: "inner_circle",
        targetFrequencyDays: 7,
        lastCheckInAt: daysAgo(15),
      },
      {
        userId: user.id,
        name: "Ananya",
        relationshipType: "friend",
        targetFrequencyDays: 14,
        lastCheckInAt: daysAgo(19),
      },
      {
        userId: user.id,
        name: "Dad",
        relationshipType: "inner_circle",
        targetFrequencyDays: 10,
        lastCheckInAt: daysAgo(2),
        birthday: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          new Date().getDate() + 2,
        ),
      },
    ],
  });

  await prisma.routine.createMany({
    data: [
      {
        userId: user.id,
        name: "Gym",
        frequencyType: "weekly",
        frequencyValue: 3,
        lastDoneAt: daysAgo(4),
      },
      {
        userId: user.id,
        name: "Read 20m",
        frequencyType: "daily",
        frequencyValue: 1,
        lastDoneAt: daysAgo(2),
      },
    ],
  });

  console.log(`Seeded user ${user.id} (${phoneNumber})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
