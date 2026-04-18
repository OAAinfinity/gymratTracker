import { Router } from "express";
import admin from "../config/firebaseAdmin.js";
import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";
import { isSubscriptionActive } from "../services/subscription.js";

const router = Router();

function normalizeWorkoutPayload(body) {
  const raw = body || {};

  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  const exercise = typeof raw.exercise === "string" ? raw.exercise.trim() : "";
  const sets = Number.parseInt(raw.sets, 10);
  const reps = Number.parseInt(raw.reps, 10);
  const weight = Number.parseFloat(raw.weight ?? 0);
  const muscle = typeof raw.muscle === "string" ? raw.muscle.trim() : "";
  const rpe = Number.parseInt(raw.rpe ?? 0, 10);
  const note = typeof raw.note === "string" ? raw.note.trim() : "";

  const errors = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push("A valid date (YYYY-MM-DD) is required");
  }

  if (!exercise) {
    errors.push("Exercise name is required");
  }

  if (!Number.isInteger(sets) || sets <= 0 || sets > 100) {
    errors.push("Sets must be an integer between 1 and 100");
  }

  if (!Number.isInteger(reps) || reps <= 0 || reps > 1000) {
    errors.push("Reps must be an integer between 1 and 1000");
  }

  if (!Number.isFinite(weight) || weight < 0 || weight > 10000) {
    errors.push("Weight must be a number between 0 and 10000");
  }

  if (!muscle) {
    errors.push("Muscle group is required");
  }

  if (!Number.isInteger(rpe) || rpe < 0 || rpe > 10) {
    errors.push("RPE must be an integer between 0 and 10");
  }

  if (exercise.length > 120) {
    errors.push("Exercise name is too long");
  }

  if (muscle.length > 64) {
    errors.push("Muscle group is too long");
  }

  if (note.length > 500) {
    errors.push("Note is too long");
  }

  return {
    errors,
    value: {
      date,
      exercise,
      sets,
      reps,
      weight,
      muscle,
      rpe,
      note,
    },
  };
}

router.post("/", verifyFirebaseToken, async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    res.status(401).json({ status: "error", message: "Unauthorized" });
    return;
  }

  const { errors, value } = normalizeWorkoutPayload(req.body);
  if (errors.length > 0) {
    res.status(400).json({
      status: "error",
      message: "Invalid workout payload",
      errors,
    });
    return;
  }

  try {
    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      res.status(403).json({
        status: "error",
        message: "User profile not found",
      });
      return;
    }

    const userProfile = userSnap.data() || {};
    if (!isSubscriptionActive(userProfile)) {
      res.status(403).json({
        status: "error",
        message: "Active subscription required",
      });
      return;
    }

    const workoutRef = db.collection("workouts").doc();
    await workoutRef.set({
      uid,
      date: value.date,
      exercise: value.exercise,
      sets: value.sets,
      reps: value.reps,
      weight: value.weight,
      muscle: value.muscle,
      rpe: value.rpe,
      note: value.note,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "api",
    });

    res.status(201).json({
      status: "ok",
      message: "Workout created",
      workout: {
        id: workoutRef.id,
        uid,
        ...value,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to create workout",
    });
  }
});

export default router;
