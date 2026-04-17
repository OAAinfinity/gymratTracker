# Payment E2E Checklist

Last updated: 2026-04-17

## Preconditions

1. Backend running with valid Razorpay env vars.
2. Frontend running with valid Firebase env vars.
3. Backend has Firebase service account configured via FIREBASE_SERVICE_ACCOUNT_PATH.
4. User account can sign in from frontend.

## Test 1: Auth Guard on Payments API

1. Call POST /api/payments/create-order without Authorization header.
2. Expected: 401 Unauthorized.
3. Call POST /api/payments/verify without Authorization header.
4. Expected: 401 Unauthorized.

## Test 2: Create Order with Bearer Token

1. Sign in on frontend.
2. Trigger monthly plan purchase.
3. Expected backend response includes status ok and Razorpay order id.
4. Expected Razorpay order notes include uid and plan.

## Test 3: Verify Signature Hardening

1. Send verify payload with altered razorpay_signature.
2. Expected: 400 Invalid payment signature.
3. No subscription fields should be changed in users/{uid}.

## Test 4: Successful Subscription Activation

1. Complete real or sandbox Razorpay payment.
2. Verify endpoint should return:
   - status ok
   - verified true
   - alreadyProcessed false on first call
3. Firestore users/{uid} should be updated with:
   - subscriptionPlan
   - subscriptionStatus = active
   - subscriptionActivatedAt
   - subscriptionExpiresAt
   - subscriptionPaymentId
   - subscriptionOrderId

## Test 5: Idempotency

1. Replay the same verify payload for same payment id.
2. Expected response:
   - status ok
   - verified true
   - alreadyProcessed true
3. No duplicate side effects should occur.

## Test 6: Audit Trail

1. After successful verify, check Firestore paymentEvents/{razorpay_payment_id}.
2. Expected fields:
   - uid
   - plan
   - razorpayOrderId
   - razorpayPaymentId
   - razorpaySignature
   - verificationStatus
   - subscription object snapshot
   - createdAt

## Test 7: Frontend Behavior

1. After successful verification, frontend should unlock Gym section.
2. Reload app.
3. Expected subscription remains active based on users/{uid} profile data.
