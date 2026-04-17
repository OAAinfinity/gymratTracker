import React, { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function InchLossChart({ entries, parts, unit, range, setRange }) {
  const [visibleParts, setVisibleParts] = useState(() =>
    Object.fromEntries(parts.map((part) => [part.key, true]))
  );

  const labels = useMemo(() => entries.map((entry) => entry.dateKey), [entries]);

  const datasets = useMemo(
    () =>
      parts
        .filter((part) => visibleParts[part.key])
        .map((part) => ({
          label: part.label,
          data: entries.map((entry) => entry[part.key]),
          borderColor: part.color,
          backgroundColor: `${part.color}66`,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          spanGaps: true,
        })),
    [entries, parts, visibleParts]
  );

  const chartData = useMemo(
    () => ({ labels, datasets }),
    [labels, datasets]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "rgba(255,255,255,0.7)", boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${context.parsed.y} ${unit}`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.08)" } },
        y: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.08)" } },
      },
    }),
    [unit]
  );

  const togglePart = (partKey) => {
    setVisibleParts((prev) => ({ ...prev, [partKey]: !prev[partKey] }));
  };

  return (
    <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40">Measurement Trend Chart</p>
        <div className="flex items-center gap-2">
          {["7", "30", "all"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-all"
              style={{
                background: range === value ? "#f97316" : "rgba(255,255,255,0.06)",
                color: range === value ? "#fff" : "rgba(255,255,255,0.6)",
              }}
            >
              {value === "all" ? "All" : `${value}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {parts.map((part) => (
          <button
            key={part.key}
            type="button"
            onClick={() => togglePart(part.key)}
            className="px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all"
            style={{
              borderColor: `${part.color}66`,
              background: visibleParts[part.key] ? `${part.color}33` : "transparent",
              color: visibleParts[part.key] ? part.color : "rgba(255,255,255,0.45)",
            }}
          >
            {part.label}
          </button>
        ))}
      </div>

      {entries.length === 0 || datasets.length === 0 ? (
        <p className="text-sm text-white/35 font-mono py-6 text-center">No chart data for the selected range.</p>
      ) : (
        <div style={{ height: 320 }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      )}
    </div>
  );
}
