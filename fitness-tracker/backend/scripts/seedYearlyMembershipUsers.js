import admin from "../src/config/firebaseAdmin.js";

const DEFAULT_PLAN = "yearly";
const PLAN_DAYS = 365;
const CREATE_MISSING_USERS = process.env.SEED_CREATE_MISSING_USERS === "true";
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "1234.qwer";

const USER_SPECS = [
  { name: "gaurang", email: "gaurang@gmail.com" },
  { name: "vaibhav", email: "vaibhav@gmail.com" },
  { name: "ronak", email: "ronak@gmail.com" },
  { name: "geetansh", email: "geetansh@gmail.com" },
];

function buildMembershipWindow(days) {
  const now = new Date();
  const expiresAtDate = new Date(now);
  expiresAtDate.setDate(expiresAtDate.getDate() + days);

  return {
    activatedAtIso: now.toISOString(),
    expiresAtIso: expiresAtDate.toISOString(),
    expiresAtTs: admin.firestore.Timestamp.fromDate(expiresAtDate),
    endDate: expiresAtDate.toISOString().split("T")[0],
  };
}

async function findExistingAuthUserByEmail(email) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }

    return null;
  }
}

async function createAuthUser({ email, name, password }) {
  return admin.auth().createUser({
    email,
    password,
    displayName: name,
    emailVerified: false,
  });
}

async function upsertMembershipProfile({ uid, email, name, membership }) {
  const db = admin.firestore();
  const profileRef = db.collection("users").doc(uid);

  await profileRef.set(
    {
      uid,
      email,
      name,
      subscriptionPlan: DEFAULT_PLAN,
      subscriptionStatus: "active",
      subscriptionActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      subscriptionActivatedAtIso: membership.activatedAtIso,
      subscriptionExpiresAt: membership.expiresAtTs,
      subscriptionExpiresAtIso: membership.expiresAtIso,
      subscriptionEndDate: membership.endDate,
      subscriptionSource: "admin-seed-script",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function seedYearlyMembershipUsers() {
  const membership = buildMembershipWindow(PLAN_DAYS);
  const updatedUsers = [];
  const skippedUsers = [];

  for (const userSpec of USER_SPECS) {
    let authUser = await findExistingAuthUserByEmail(userSpec.email);
    if (!authUser && CREATE_MISSING_USERS) {
      authUser = await createAuthUser({
        email: userSpec.email,
        name: userSpec.name,
        password: DEFAULT_PASSWORD,
      });
    }

    if (!authUser) {
      skippedUsers.push({
        email: userSpec.email,
        name: userSpec.name,
        reason: "Firebase Auth user not found (set SEED_CREATE_MISSING_USERS=true to create)",
      });
      continue;
    }

    await upsertMembershipProfile({
      uid: authUser.uid,
      email: userSpec.email,
      name: userSpec.name,
      membership,
    });

    updatedUsers.push({
      uid: authUser.uid,
      email: userSpec.email,
      name: userSpec.name,
      expiresOn: membership.endDate,
    });
  }

  console.log("Membership seed run complete.");
  console.log("Yearly membership granted for:");
  for (const row of updatedUsers) {
    console.log(`- ${row.name} <${row.email}> uid=${row.uid} expires=${row.expiresOn}`);
  }

  if (skippedUsers.length > 0) {
    console.log("Skipped users:");
    for (const row of skippedUsers) {
      console.log(`- ${row.name} <${row.email}> reason=${row.reason}`);
    }
  }

  if (CREATE_MISSING_USERS) {
    console.log("Create-missing mode was enabled via SEED_CREATE_MISSING_USERS=true.");
  }
}

seedYearlyMembershipUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
