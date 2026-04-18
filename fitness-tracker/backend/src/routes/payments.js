import { Router } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import admin from "../config/firebaseAdmin.js";

const router = Router();
const WEBHOOK_EVENTS = new Set(["payment.captured", "payment.failed", "order.paid"]);

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

function buildSubscriptionSnapshot({ plan, paymentId, orderId, days }) {
  const expiresAtDate = new Date();
  expiresAtDate.setDate(expiresAtDate.getDate() + days);

  return {
    expiresAtDate,
    subscriptionSnapshot: {
      subscriptionPlan: plan,
      subscriptionStatus: "active",
      subscriptionActivatedAt: new Date().toISOString(),
      subscriptionExpiresAt: expiresAtDate.toISOString(),
      subscriptionEndDate: expiresAtDate.toISOString().split("T")[0],
      subscriptionPaymentId: paymentId,
      subscriptionOrderId: orderId,
    },
  };
}

async function fetchOrderContext(orderId) {
  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.fetch(orderId);
  const orderUid = order?.notes?.uid;
  const orderPlan = order?.notes?.plan;

  if (!order || !orderUid || !orderPlan) {
    throw new Error("Order does not include subscription context");
  }

  return { order, orderUid, orderPlan };
}

async function activateSubscription({ userUid, plan, orderId, paymentId, signature, verificationStatus, source }) {
  const planConfig = PLAN_CONFIG[plan];
  if (!planConfig) {
    throw new Error("Invalid subscription plan");
  }

  const db = admin.firestore();
  const profileRef = db.collection("users").doc(userUid);
  const paymentEventRef = db.collection("paymentEvents").doc(paymentId);
  const { expiresAtDate, subscriptionSnapshot } = buildSubscriptionSnapshot({
    plan,
    paymentId,
    orderId,
    days: planConfig.days,
  });
  const expiresAt = admin.firestore.Timestamp.fromDate(expiresAtDate);

  return db.runTransaction(async (tx) => {
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
      razorpaySignature: signature || null,
      verificationStatus,
      source,
      subscription: subscriptionSnapshot,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      alreadyProcessed: false,
      subscription: subscriptionSnapshot,
    };
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
    const { orderUid, orderPlan } = await fetchOrderContext(orderId);
    const userUid = orderUid;

    if (!userUid || orderPlan !== plan) {
      res.status(400).json({
        status: "error",
        message: "Order does not match subscription plan or user",
      });
      return;
    }

    const txResult = await activateSubscription({
      userUid,
      plan,
      orderId,
      paymentId,
      signature,
      verificationStatus: "verified",
      source: "manual_verify",
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

router.post("/webhook", async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const webhookSignature = req.headers["x-razorpay-signature"];
  const rawBody = req.rawBody;
  const eventName = req.body?.event;

  if (!webhookSecret) {
    res.status(500).json({ status: "error", message: "Razorpay webhook secret is not configured" });
    return;
  }

  if (!rawBody || !webhookSignature) {
    res.status(400).json({ status: "error", message: "Missing webhook signature or body" });
    return;
  }

  let expectedSignature;
  try {
    const signaturePayload = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(typeof rawBody === "string" ? rawBody : JSON.stringify(req.body || {}));

    expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(signaturePayload)
      .digest("hex");
  } catch (error) {
    res.status(400).json({ status: "error", message: "Unable to validate webhook signature payload" });
    return;
  }

  if (expectedSignature !== webhookSignature) {
    res.status(400).json({ status: "error", message: "Invalid webhook signature" });
    return;
  }

  if (!WEBHOOK_EVENTS.has(eventName)) {
    res.json({ status: "ok", ignored: true, event: eventName || null });
    return;
  }

  try {
    const paymentEntity = req.body?.payload?.payment?.entity;
    const orderEntity = req.body?.payload?.order?.entity;
    const orderId = paymentEntity?.order_id || orderEntity?.id;
    const paymentId = paymentEntity?.id || req.body?.payload?.payment?.entity?.payment_id || orderId;

    if (!orderId || !paymentId) {
      res.status(400).json({ status: "error", message: "Webhook payload is missing payment context" });
      return;
    }

    if (eventName === "payment.failed") {
      const { orderUid, orderPlan } = await fetchOrderContext(orderId);
      const db = admin.firestore();
      await db.collection("paymentEvents").doc(paymentId).set(
        {
          uid: orderUid,
          plan: orderPlan,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: webhookSignature,
          verificationStatus: "failed",
          source: "razorpay_webhook",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.json({
        status: "ok",
        verified: true,
        ignored: true,
        event: eventName,
        uid: orderUid,
      });
      return;
    }

    const { orderUid, orderPlan } = await fetchOrderContext(orderId);
    const txResult = await activateSubscription({
      userUid: orderUid,
      plan: orderPlan,
      orderId,
      paymentId,
      signature: webhookSignature,
      verificationStatus: "webhook_verified",
      source: "razorpay_webhook",
    });

    res.json({
      status: "ok",
      verified: true,
      alreadyProcessed: txResult.alreadyProcessed,
      uid: orderUid,
      subscription: txResult.subscription,
      event: eventName,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to process webhook",
    });
  }
});

export default router;