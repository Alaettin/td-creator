import { useState, type ChangeEvent, type DragEvent } from "react";

export function Ablage({ onDateien }: { onDateien: (dateien: File[]) => void }) {
  const [ueber, setUeber] = useState(false);

  function fallen(e: DragEvent) {
    e.preventDefault();
    setUeber(false);
    const dateien = Array.from(e.dataTransfer.files);
    if (dateien.length > 0) onDateien(dateien);
  }

  function gewaehlt(e: ChangeEvent<HTMLInputElement>) {
    // Erst kopieren, dann zurücksetzen: das Leeren des Feldes leert die FileList an Ort und Stelle.
    const dateien = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (dateien.length > 0) onDateien(dateien);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setUeber(true);
      }}
      onDragLeave={() => setUeber(false)}
      onDrop={fallen}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        ueber ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-white"
      }`}
    >
      <p className="font-medium">AAS-JSON-Dateien hier ablegen</p>
      <p className="text-sm text-slate-500">Eine oder mehrere, jede darf mehrere Submodels enthalten</p>
      <label className="mt-2 cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
        Dateien auswählen
        <input type="file" accept=".json,application/json" multiple onChange={gewaehlt} className="sr-only" />
      </label>
    </div>
  );
}
