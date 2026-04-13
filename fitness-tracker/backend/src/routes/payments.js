import { Router } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";

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
  const { plan } = req.body || {};
  const planConfig = PLAN_CONFIG[plan];

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
      notes: { plan },
    });

    res.json({
      status: "ok",
      keyId: process.env.RAZORPAY_KEY_ID,
      order,
      plan,
      days: planConfig.days,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to create Razorpay order",
    });
  }
});

router.post("/verify", (req, res) => {
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

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + planConfig.days);

  res.json({
    status: "ok",
    verified: true,
    subscription: {
      subscriptionPlan: plan,
      subscriptionEndDate: expiresAt.toISOString().split("T")[0],
      subscriptionExpiresAt: expiresAt.toISOString(),
    },
  });
});

export default router;