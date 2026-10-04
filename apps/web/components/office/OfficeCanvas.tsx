'use client';

import { officeLayout } from '@intelligo/shared';
import { useEffect, useRef, useState } from 'react';
import type { AgentSummary, OfficeSnapshot } from '@/lib/office/types';
import type { AgentLiveState, OfficeScene } from './scene/OfficeScene';
import { watchTheme } from './scene/theme';

interface Props {
  agents: AgentSummary[];
  states: OfficeSnapshot['states'];
  selectedId: string | null;
  labelsVisible: boolean;
  onSelect(agentId: string): void;
}

declare global {
  interface Window {
    /** Read-only handle used by Playwright to check character positions. */
    __office?: OfficeScene;
  }
}

export function OfficeCanvas({ agents, states, selectedId, labelsVisible, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const agentKey = agents.map((a) => `${a.id}:${a.desk_id}:${a.appearance.shirt}`).join('|');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || agents.length === 0) return;
    let cancelled = false;
    let scene: OfficeScene | null = null;
    import('./scene/OfficeScene')
      .then(({ OfficeScene: Scene }) =>
        Scene.create(host, {
          layout: officeLayout,
          agents: agents.map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            deskId: a.desk_id,
            appearance: a.appearance,
          })),
          onSelect: (id) => onSelectRef.current(id),
        }),
      )
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        scene = created;
        sceneRef.current = created;
        window.__office = created;
        setReady(true);
      })
      .catch((error: unknown) => {
        console.error('[office] gagal memuat kanvas:', error);
        if (!cancelled) setFailed(true);
      });
    const stopWatching = watchTheme(() => sceneRef.current?.refreshTheme());
    return () => {
      cancelled = true;
      stopWatching();
      scene?.destroy();
      sceneRef.current = null;
      if (window.__office === scene) delete window.__office;
      setReady(false);
    };
    // Recreate only when the set of characters changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey]);

  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.setStates(
      Object.values(states).map((s) => ({
        agentId: s.agent_id,
        activity: s.activity,
        statusText: s.status_text,
        targetSpot: s.target_spot,
      })) satisfies AgentLiveState[],
    );
  }, [states, ready]);

  useEffect(() => {
    if (ready) sceneRef.current?.setSelected(selectedId);
  }, [selectedId, ready]);

  useEffect(() => {
    if (ready) sceneRef.current?.setLabelsVisible(labelsVisible);
  }, [labelsVisible, ready]);

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden"
      data-testid="office-canvas"
      data-ready={ready}
    >
      {failed ? (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
          Kanvas kantor gagal dimuat. Pastikan browser mendukung WebGL lalu muat ulang halaman.
        </p>
      ) : null}
    </div>
  );
}
