import admin from "../config/firebaseAdmin.js";

export default async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      status: "error",
      message: "Unauthorized",
    });
    return;
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    res.status(401).json({
      status: "error",
      message: "Unauthorized",
    });
    return;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch {
    res.status(401).json({
      status: "error",
      message: "Unauthorized",
    });
  }
}
