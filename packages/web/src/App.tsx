// SPDX-License-Identifier: Apache-2.0
import { Board } from "./Board";
import { useProjectSnapshot } from "./useProjectSnapshot";
import { LanguageProvider, useLanguage } from "./i18n/language";

export function App() {
  return (
    <LanguageProvider>
      <Project />
    </LanguageProvider>
  );
}

function Project() {
  const { snapshot, connection, error } = useProjectSnapshot();
  const { t } = useLanguage();

  if (snapshot) return <Board snapshot={snapshot} connection={connection} error={error} />;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <section className="connection-panel">
        <p className="eyebrow">{t.connection.workbench}</p>
        <h1 className="mt-3 text-xl font-semibold">{t.connection.opening}</h1>
        <p className="mt-3 muted" role="status">
          {error ? t.connection.unavailable : t.connection.reading}
        </p>
        {error && (
          <p className="mt-3 warning" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
