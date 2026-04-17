import React, { useMemo } from "react";

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

export default function AnalyticsSummary({ entries, allEntries, parts, unit }) {
  const stats = useMemo(() => {
    if (!entries.length) return [];

    return parts.map((part) => {
      const first = entries[0][part.key];
      const latest = entries[entries.length - 1][part.key];
      const totalLoss = Number.isFinite(first) && Number.isFinite(latest) ? +(first - latest).toFixed(2) : null;

      const spanDays = daysBetween(entries[0].dateKey, entries[entries.length - 1].dateKey);
      const weeklyAverage = totalLoss === null ? null : +((totalLoss / spanDays) * 7).toFixed(2);
      const trend = totalLoss === null ? "unknown" : totalLoss > 0 ? "decreasing" : totalLoss < 0 ? "increasing" : "stable";

      const last7 = allEntries.filter((entry) => {
        const latestDate = new Date(`${allEntries[allEntries.length - 1].dateKey}T00:00:00`).getTime();
        const entryDate = new Date(`${entry.dateKey}T00:00:00`).getTime();
        return latestDate - entryDate <= 7 * 24 * 60 * 60 * 1000;
      });

      let plateau = false;
      if (last7.length >= 2) {
        const first7 = last7[0][part.key];
        const last7Val = last7[last7.length - 1][part.key];
        if (Number.isFinite(first7) && Number.isFinite(last7Val)) {
          plateau = Math.abs(first7 - last7Val) < 0.1;
        }
      }

      return {
        ...part,
        first,
        latest,
        totalLoss,
        weeklyAverage,
        trend,
        spanDays,
        plateau,
      };
    });
  }, [entries, allEntries, parts]);

  const insightLines = useMemo(() => {
    const lines = [];

    for (const item of stats) {
      if (item.totalLoss === null) continue;
      if (item.totalLoss > 0) {
        lines.push(`${item.label} reduced by ${item.totalLoss} ${unit} in ${item.spanDays} days.`);
      } else if (item.totalLoss < 0) {
        lines.push(`${item.label} increased by ${Math.abs(item.totalLoss)} ${unit} in ${item.spanDays} days.`);
      }

      if (item.plateau) {
        lines.push(`No progress detected in last 7 days for ${item.label}.`);
      }
    }

    return lines;
  }, [stats, unit]);

  return (
    <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-5">Analytics Summary</p>
      {stats.length === 0 ? (
        <p className="text-sm text-white/35 font-mono">Add at least two logs to view analytics.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            {stats.map((item) => (
              <div
                key={item.key}
                className="rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${item.color}40` }}
              >
                <p className="text-[11px] uppercase tracking-widest font-mono" style={{ color: `${item.color}cc` }}>
                  {item.label}
                </p>
                <p className="text-xl font-black mt-2">
                  {item.totalLoss === null ? "—" : `${item.totalLoss > 0 ? "-" : "+"}${Math.abs(item.totalLoss)} ${unit}`}
                </p>
                <p className="text-xs text-white/50 font-mono mt-1">
                  Weekly avg: {item.weeklyAverage === null ? "—" : `${item.weeklyAverage > 0 ? "-" : "+"}${Math.abs(item.weeklyAverage)} ${unit}`}
                </p>
                <p className="text-xs text-white/35 font-mono mt-1">Trend: {item.trend}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-[11px] uppercase tracking-widest font-mono text-white/40 mb-2">Insights</p>
            {insightLines.length === 0 ? (
              <p className="text-sm text-white/35 font-mono">Not enough variation yet to generate insights.</p>
            ) : (
              <div className="space-y-1">
                {insightLines.map((line, index) => (
                  <p key={index} className="text-sm text-white/70 font-mono">• {line}</p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
