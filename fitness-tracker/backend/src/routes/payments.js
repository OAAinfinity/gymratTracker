import { Router } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import admin from "../config/firebaseAdmin.js";

const router = Router();

const PLAN_CONFIG = {
  monthly: { amount: 6900, days: 30 },
  yearly: { amount: 39900, days: 365 },
};

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay keys are not configured on the server");
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

router.post("/create-order", async (req, res) => {
  const { plan, uid } = req.body || {};
  const planConfig = PLAN_CONFIG[plan];
  const userUid = uid || "guest";

  if (!planConfig) {
    res.status(400).json({ status: "error", message: "Invalid subscription plan" });
    return;
  }

  try {
    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: planConfig.amount,
      currency: "INR",
      receipt: `gym_${plan}_${Date.now()}`,
      notes: { plan, uid: userUid },
    });

    res.json({
      status: "ok",
      keyId: process.env.RAZORPAY_KEY_ID,
      order,
      plan,
      days: planConfig.days,
      uid: userUid,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to create Razorpay order",
    });
  }
});

router.post("/verify", async (req, res) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    plan,
  } = req.body || {};

  const planConfig = PLAN_CONFIG[plan];
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!orderId || !paymentId || !signature || !planConfig) {
    res.status(400).json({ status: "error", message: "Missing payment verification data" });
    return;
  }

  if (!keySecret) {
    res.status(500).json({ status: "error", message: "Razorpay secret is not configured" });
    return;
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const verified = expectedSignature === signature;
  if (!verified) {
    res.status(400).json({ status: "error", message: "Invalid payment signature" });
    return;
  }

  try {
    // Defense-in-depth: verify the order belongs to the same uid and plan.
    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.fetch(orderId);
    const orderUid = order?.notes?.uid;
    const orderPlan = order?.notes?.plan;
    const userUid = orderUid;

    if (!order || !userUid || orderPlan !== plan) {
      res.status(400).json({
        status: "error",
        message: "Order does not match subscription plan or user",
      });
      return;
    }

    const db = admin.firestore();
    const profileRef = db.collection("users").doc(userUid);
    const paymentEventRef = db.collection("paymentEvents").doc(paymentId);
    const expiresAtDate = new Date();
    expiresAtDate.setDate(expiresAtDate.getDate() + planConfig.days);
    const expiresAt = admin.firestore.Timestamp.fromDate(expiresAtDate);
    const subscriptionSnapshot = {
      subscriptionPlan: plan,
      subscriptionStatus: "active",
      subscriptionActivatedAt: new Date().toISOString(),
      subscriptionExpiresAt: expiresAtDate.toISOString(),
      subscriptionEndDate: expiresAtDate.toISOString().split("T")[0],
      subscriptionPaymentId: paymentId,
      subscriptionOrderId: orderId,
    };

    const txResult = await db.runTransaction(async (tx) => {
      const existingEvent = await tx.get(paymentEventRef);
      if (existingEvent.exists) {
        return {
          alreadyProcessed: true,
          subscription: existingEvent.data()?.subscription || subscriptionSnapshot,
        };
      }

      tx.set(
        profileRef,
        {
          subscriptionPlan: plan,
          subscriptionStatus: "active",
          subscriptionActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
          subscriptionExpiresAt: expiresAt,
          subscriptionEndDate: expiresAtDate.toISOString().split("T")[0],
          subscriptionPaymentId: paymentId,
          subscriptionOrderId: orderId,
        },
        { merge: true }
      );

      tx.set(paymentEventRef, {
        uid: userUid,
        plan,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        verificationStatus: "verified",
        subscription: subscriptionSnapshot,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        alreadyProcessed: false,
        subscription: subscriptionSnapshot,
      };
    });

    res.json({
      status: "ok",
      verified: true,
      alreadyProcessed: txResult.alreadyProcessed,
      uid: userUid,
      subscription: txResult.subscription,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to activate subscription",
    });
  }
});

export default router;