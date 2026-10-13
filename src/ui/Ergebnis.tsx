import type { Fund } from "../merge/bericht";
import type { Ergebnis, Modus } from "../merge/zusammenfuehren";

const DATEINAME = "TechnicalData-merged.json";

function herunterladen(inhalt: unknown) {
  const blob = new Blob([JSON.stringify(inhalt, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = DATEINAME;
  a.click();
  URL.revokeObjectURL(url);
}

export function ErgebnisAnsicht({ ergebnis, modus }: { ergebnis: Ergebnis; modus: Modus }) {
  const { bericht } = ergebnis;
  const weitere = bericht.mehrfach.reduce((summe, m) => summe + m.weitere.length, 0);
  const zahl = (n: number) => n.toLocaleString("de-DE");

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Ergebnis</h2>
        <button
          type="button"
          onClick={() => herunterladen(ergebnis.umgebung)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {DATEINAME} herunterladen
        </button>
      </div>

      <dl className={`grid grid-cols-2 gap-3 ${modus === "advanced" ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        <Kennzahl name="Submodels" wert={bericht.submodelZahl} />
        <Kennzahl name="Gelesen" wert={bericht.gelesen} />
        <Kennzahl name="Übernommen" wert={bericht.uebernommen.length} />
        {modus === "advanced" && <Kennzahl name="Blöcke" wert={bericht.bloecke} />}
        <Kennzahl name="Neue CDs" wert={bericht.neueCDs} />
      </dl>
      <p className="text-xs text-slate-500 tabular-nums">
        Gelesen {zahl(bericht.gelesen)} = {zahl(bericht.uebernommen.length)} übernommen + {zahl(weitere)} weitere
        Vorkommen derselben Eigenschaften + {zahl(bericht.konflikte.length)} Konflikte +{" "}
        {zahl(bericht.ohneSemanticId.length)} ohne semanticId
      </p>

      <div className="flex flex-col gap-2">
        <Liste titel="Übernommen" funde={bericht.uebernommen} />
        <Liste titel="ConceptDescription aus der Vorlage verwendet" funde={bericht.cdAusVorlage} />
        <Liste
          titel="In mehreren Submodels, einmal übernommen"
          funde={bericht.mehrfach}
          zusatz={(f) => `zusätzlich in ${f.weitere.length} Submodel${f.weitere.length === 1 ? "" : "s"}`}
          hinweis={(f) => [`übernommen aus ${f.quelle}`, ...f.weitere].join("\n")}
        />
        <Liste
          titel="Konflikte: gleiche semanticId, anderer Typ"
          warnung
          funde={bericht.konflikte}
          zusatz={(f) => `${f.erwartet} gegen ${f.gefunden}`}
        />
        <Liste
          titel="Name mit Zähler ergänzt, weil er schon vergeben war"
          funde={bericht.umbenannt}
          zusatz={(f) => `in der Quelle ${f.von || "ohne idShort"}`}
        />
        <Liste titel="Weggelassen, keine semanticId" warnung funde={bericht.ohneSemanticId} />
        <Liste
          titel="Block ohne semanticId, Inhalt eine Ebene höher einsortiert"
          warnung
          funde={bericht.aufgeloesteBloecke}
        />
        <Liste titel="idShort verstößt gegen die AAS-Regel" warnung funde={bericht.ungueltigeIdShorts} />
        <Liste
          titel="Keine ConceptDescription in den Quellen"
          warnung
          funde={bericht.fehlendeCDs}
          zusatz={(f) => (f.cdId === f.semanticId ? f.quelle : `fehlt: ${f.cdId}`)}
          hinweis={(f) => f.quelle}
        />
      </div>
    </section>
  );
}

function Kennzahl({ name, wert }: { name: string; wert: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{name}</dt>
      <dd className="text-xl font-semibold tabular-nums">{wert}</dd>
    </div>
  );
}

function Liste<T extends Fund>({
  titel,
  funde,
  warnung = false,
  zusatz,
  hinweis,
}: {
  titel: string;
  funde: T[];
  warnung?: boolean;
  zusatz?: (f: T) => string;
  /** Tooltip der Zusatzspalte. */
  hinweis?: (f: T) => string;
}) {
  if (funde.length === 0) return null;
  return (
    <details className={`rounded-lg border ${warnung ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {titel} <span className="tabular-nums text-slate-500">({funde.length})</span>
      </summary>
      <div className="max-h-80 overflow-auto border-t border-slate-200">
        <table className="w-full table-fixed text-left text-xs">
          <tbody>
            {funde.map((f, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="w-1/4 break-words px-3 py-1.5 font-medium">{f.idShort || "(ohne)"}</td>
                <td className="w-1/3 break-all px-3 py-1.5 font-mono text-slate-600">{f.semanticId || "(ohne)"}</td>
                <td className="px-3 py-1.5 text-slate-500" title={hinweis?.(f)}>
                  {zusatz ? zusatz(f) : f.quelle}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
