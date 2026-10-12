import type { Quelle } from "../merge/einlesen";

interface Props {
  quellen: Quelle[];
  abgewaehlt: Set<string>;
  onUmschalten: (schluessel: string) => void;
  onEntfernen: (datei: string) => void;
}

export function Auswahl({ quellen, abgewaehlt, onUmschalten, onEntfernen }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Submodels</h2>
      {quellen.map((quelle) => (
        <div key={quelle.datei} className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="truncate font-mono text-sm">{quelle.datei}</span>
            <button
              type="button"
              onClick={() => onEntfernen(quelle.datei)}
              className="shrink-0 text-sm text-slate-500 hover:text-red-700"
            >
              Entfernen
            </button>
          </div>
          <ul>
            {quelle.submodels.map((s) => (
              <li key={s.schluessel}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={!abgewaehlt.has(s.schluessel)}
                    onChange={() => onUmschalten(s.schluessel)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{s.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {s.elementzahl} Eigenschaften · {s.submodel.id}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
