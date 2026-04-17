import React, { useMemo, useState } from "react";

export default function MeasurementForm({ parts, unit, existingDateKeys, onSave, busy, externalError }) {
  const today = new Date().toISOString().split("T")[0];
  const initialValues = useMemo(
    () => Object.fromEntries(parts.map((part) => [part.key, ""])),
    [parts]
  );

  const [dateKey, setDateKey] = useState(today);
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");

    const parsedValues = {};
    let enteredCount = 0;
    for (const part of parts) {
      const raw = (values[part.key] || "").trim();
      if (raw === "") {
        continue;
      }
      const parsed = Number.parseFloat(raw);
      if (!Number.isFinite(parsed)) {
        setError(`Enter a valid number for ${part.label}.`);
        return;
      }
      parsedValues[part.key] = parsed;
      enteredCount += 1;
    }

    if (enteredCount === 0) {
      setError("Enter at least one measurement.");
      return;
    }

    try {
      await onSave({
        dateKey,
        notes: notes.trim(),
        values: parsedValues,
      });
      setDateKey(today);
      setNotes("");
      setValues(initialValues);
    } catch (saveError) {
      setError(saveError?.message || "Failed to save measurements.");
    }
  };

  return (
    <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mb-5">LOG DAILY MEASUREMENTS ({unit})</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {parts.map((part) => (
          <div key={part.key}>
            <label className="text-[11px] font-mono uppercase tracking-wider block mb-2" style={{ color: `${part.color}aa` }}>
              {part.label}
            </label>
            <input
              type="number"
              step="0.1"
              placeholder="0.0"
              value={values[part.key]}
              onChange={(event) => setValues((prev) => ({ ...prev, [part.key]: event.target.value }))}
              className="w-full rounded-xl px-3 py-2.5 text-white font-mono bg-transparent outline-none text-sm"
              style={{ border: `1px solid ${part.color}30`, background: `${part.color}08` }}
            />
          </div>
        ))}
        <div>
          <label className="text-[11px] font-mono uppercase tracking-wider text-white/40 block mb-2">Date</label>
          <input
            type="date"
            value={dateKey}
            onChange={(event) => setDateKey(event.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-white font-mono bg-transparent outline-none text-sm"
            style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", colorScheme: "dark" }}
          />
        </div>
        <div className="col-span-2 md:col-span-2">
          <label className="text-[11px] font-mono uppercase tracking-wider text-white/40 block mb-2">Notes (optional)</label>
          <input
            type="text"
            placeholder="Any observations..."
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-white font-mono bg-transparent outline-none text-sm"
            style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
          />
        </div>
      </div>
      {(error || externalError) && <p className="text-xs text-red-400 font-mono mb-3">{error || externalError}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy}
        className="w-full py-3 rounded-xl font-mono font-bold tracking-widest text-sm transition-all"
        style={{ background: "#f97316", color: "#fff", opacity: busy ? 0.7 : 1 }}
      >
        {busy ? "SAVING..." : "SAVE MEASUREMENTS"}
      </button>
    </div>
  );
}
