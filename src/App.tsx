import { useState } from "react";
import vorlageDaten from "../vorlagen/IDTA-02003-TechnicalData-2.0.json";
import { einlesen, EinleseFehler, type Quelle } from "./merge/einlesen";
import { zusammenfuehren, type Ergebnis } from "./merge/zusammenfuehren";
import type { Umgebung } from "./merge/typen";
import { Ablage } from "./ui/Ablage";
import { Auswahl } from "./ui/Auswahl";
import { ErgebnisAnsicht } from "./ui/Ergebnis";

const vorlage = vorlageDaten as unknown as Umgebung;

export function App() {
  const [quellen, setQuellen] = useState<Quelle[]>([]);
  const [fehler, setFehler] = useState<{ datei: string; text: string }[]>([]);
  // Gespeichert wird nur, was abgewählt ist: neue Submodels sind damit von selbst ausgewählt.
  const [abgewaehlt, setAbgewaehlt] = useState<Set<string>>(new Set());
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);

  const ausgewaehlt = quellen.flatMap((q) => q.submodels).filter((s) => !abgewaehlt.has(s.schluessel));

  async function dateienAnnehmen(dateien: File[]) {
    const neu: Quelle[] = [];
    const meldungen: { datei: string; text: string }[] = [];
    for (const datei of dateien) {
      try {
        neu.push(einlesen(datei.name, await datei.text()));
      } catch (e) {
        const text = e instanceof EinleseFehler ? e.message : `${datei.name}: ${(e as Error).message}`;
        meldungen.push({ datei: datei.name, text });
      }
    }
    // Eine erneut abgelegte Datei gleichen Namens ersetzt die alte.
    const namen = new Set(neu.map((q) => q.datei));
    setQuellen((alt) => [...alt.filter((q) => !namen.has(q.datei)), ...neu]);
    // Ablagen laufen nebeneinander: jede ersetzt nur die Meldungen ihrer eigenen Dateien.
    const betroffen = new Set(dateien.map((d) => d.name));
    setFehler((alt) => [...alt.filter((f) => !betroffen.has(f.datei)), ...meldungen]);
    setErgebnis(null);
  }

  function entfernen(datei: string) {
    setQuellen((alt) => alt.filter((q) => q.datei !== datei));
    setErgebnis(null);
  }

  function umschalten(schluessel: string) {
    setAbgewaehlt((alt) => {
      const neu = new Set(alt);
      if (neu.has(schluessel)) neu.delete(schluessel);
      else neu.add(schluessel);
      return neu;
    });
    setErgebnis(null);
  }

  function mergen() {
    const cds = new Map(quellen.map((q) => [q.datei, q.conceptDescriptions]));
    setErgebnis(
      zusammenfuehren(
        vorlage,
        ausgewaehlt.map((s) => ({ datei: s.datei, submodel: s.submodel, conceptDescriptions: cds.get(s.datei)! })),
      ),
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold">TD Creator</h1>
        <p className="mt-1 text-sm text-slate-600">
          Führt die Eigenschaften von Klassen-Submodellen als flaches Superset in das IDTA-Template Technical Data 2.0
          zusammen, samt ConceptDescriptions. IDs und übrige Vorlage bleiben unverändert.
        </p>
      </header>

      <Ablage onDateien={dateienAnnehmen} />

      {fehler.length > 0 && (
        <ul className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {fehler.map((f) => (
            <li key={f.datei}>{f.text}</li>
          ))}
        </ul>
      )}

      {quellen.length > 0 && (
        <Auswahl quellen={quellen} abgewaehlt={abgewaehlt} onUmschalten={umschalten} onEntfernen={entfernen} />
      )}

      {quellen.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={mergen}
            disabled={ausgewaehlt.length === 0}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Merge
          </button>
          <span className="text-sm text-slate-600">
            {ausgewaehlt.length === 0
              ? "Kein Submodel ausgewählt"
              : `${ausgewaehlt.length} Submodel${ausgewaehlt.length === 1 ? "" : "s"} ausgewählt`}
          </span>
        </div>
      )}

      {ergebnis && <ErgebnisAnsicht ergebnis={ergebnis} />}
    </main>
  );
}
