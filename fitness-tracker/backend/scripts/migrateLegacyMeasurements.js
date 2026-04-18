import admin from "../src/config/firebaseAdmin.js";

const LEGACY_COLLECTION = "measurements";
const TARGET_SUBCOLLECTION = "measurements";
const MAX_BATCH_SIZE = 500;

const PART_MAP = {
  waist: "waist",
  chest: "chest",
  hips: "hips",
  arms: "arms",
  thigh: "thigh",
  thighs: "thigh",
};

function normalizeDateKey(rawDate) {
  if (!rawDate || typeof rawDate !== "string") return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return trimmed;
}

function normalizePart(rawPart) {
  if (!rawPart || typeof rawPart !== "string") return null;
  return PART_MAP[rawPart.trim().toLowerCase()] || null;
}

function toDateTimestamp(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return admin.firestore.Timestamp.fromDate(date);
}

async function flushBatch(db, writes) {
  if (!writes.length) return;

  let batch = db.batch();
  let count = 0;

  for (const write of writes) {
    batch.set(write.ref, write.data, { merge: true });
    count += 1;

    if (count === MAX_BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

async function migrateLegacyMeasurements() {
  const db = admin.firestore();
  const snapshot = await db.collection(LEGACY_COLLECTION).get();

  if (snapshot.empty) {
    console.log("No legacy measurements found. Nothing to migrate.");
    return;
  }

  const docs = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => {
      const uidA = a.uid || "";
      const uidB = b.uid || "";
      if (uidA !== uidB) return uidA.localeCompare(uidB);

      const dateA = a.date || "";
      const dateB = b.date || "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      const createdAtA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const createdAtB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      if (createdAtA !== createdAtB) return createdAtA - createdAtB;

      return String(a.id).localeCompare(String(b.id));
    });

  const grouped = new Map();
  let skipped = 0;

  for (const doc of docs) {
    const uid = typeof doc.uid === "string" ? doc.uid.trim() : "";
    const dateKey = normalizeDateKey(doc.date);
    const mappedPart = normalizePart(doc.part);
    const value = Number(doc.val);

    if (!uid || !dateKey || !mappedPart || !Number.isFinite(value)) {
      skipped += 1;
      continue;
    }

    const key = `${uid}::${dateKey}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        uid,
        dateKey,
        parts: {},
      });
    }

    // Deterministic overwrite based on sorted order; latest record for a part wins.
    grouped.get(key).parts[mappedPart] = value;
  }

  const writes = [];
  for (const group of grouped.values()) {
    const ref = db
      .collection("users")
      .doc(group.uid)
      .collection(TARGET_SUBCOLLECTION)
      .doc(group.dateKey);

    writes.push({
      ref,
      data: {
        dateKey: group.dateKey,
        date: toDateTimestamp(group.dateKey),
        waist: Number.isFinite(group.parts.waist) ? group.parts.waist : 0,
        chest: Number.isFinite(group.parts.chest) ? group.parts.chest : 0,
        hips: Number.isFinite(group.parts.hips) ? group.parts.hips : 0,
        thigh: Number.isFinite(group.parts.thigh) ? group.parts.thigh : 0,
        arms: Number.isFinite(group.parts.arms) ? group.parts.arms : 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  }

  await flushBatch(db, writes);

  console.log("Legacy measurement migration complete.");
  console.log(`Legacy docs read: ${snapshot.size}`);
  console.log(`Grouped daily docs written (upsert): ${writes.length}`);
  console.log(`Legacy docs skipped: ${skipped}`);
}

migrateLegacyMeasurements()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
