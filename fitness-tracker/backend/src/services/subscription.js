function parseSubscriptionExpiry(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    // Handle date-only strings as valid through end-of-day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const dateOnly = new Date(`${value}T23:59:59.999Z`);
      return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object" && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  if (
    typeof value === "object" &&
    typeof value.seconds === "number" &&
    typeof value.nanoseconds === "number"
  ) {
    const millis = value.seconds * 1000 + Math.floor(value.nanoseconds / 1000000);
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function isSubscriptionActive(userProfile, now = new Date()) {
  if (!userProfile || userProfile.subscriptionStatus !== "active") {
    return false;
  }

  const expiresAt = parseSubscriptionExpiry(userProfile.subscriptionExpiresAt);
  if (!expiresAt) {
    return false;
  }

  return expiresAt.getTime() > now.getTime();
}

export default isSubscriptionActive;
