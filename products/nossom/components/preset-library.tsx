'use client';
import { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { validRecipe, type SavedRecipe } from '@/lib/saved-presets';
import type { Operation } from '@/lib/presets';
export default function PresetLibrary({
  operation,
  owner,
  current,
  onLoad,
  disabled,
}: {
  operation: Operation;
  owner: string;
  current: Omit<SavedRecipe, 'id' | 'name'>;
  onLoad: (recipe: SavedRecipe) => void;
  disabled: boolean;
}) {
  const [items, setItems] = useState<SavedRecipe[]>([]),
    [name, setName] = useState(''),
    [message, setMessage] = useState('');
  const key = 'nossom-presets-' + owner + '-' + operation;
  useEffect(() => {
    setName('');
    setMessage('');
    try {
      let raw = localStorage.getItem(key);
      if (raw === null && localStorage.getItem('nossom-legacy-owner') === owner) {
        raw = localStorage.getItem('nossom-presets-' + operation);
        if (raw) localStorage.setItem(key, raw);
      }
      const parsed = raw && raw.length < 200000 ? JSON.parse(raw) : [];
      setItems(
        Array.isArray(parsed)
          ? parsed
              .filter(validRecipe)
              .filter((p) => p.operation === operation)
              .slice(0, 20)
          : [],
      );
    } catch {
      setItems([]);
    }
  }, [key, operation]);
  function persist(next: SavedRecipe[]) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setItems(next);
      return true;
    } catch {
      setMessage('Não foi possível salvar os presets neste navegador.');
      return false;
    }
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (items.length >= 20) {
      setMessage('Limite de 20 presets por ferramenta. Exclua um para salvar outro.');
      return;
    }
    const preset = { ...current, id: crypto.randomUUID(), name: name.trim().slice(0, 60) };
    if (!preset.name || !validRecipe(preset)) return;
    if (persist([...items, preset])) {
      setName('');
      setMessage('Preset salvo neste navegador.');
    }
  }
  return (
    <section className="preset-library">
      <div>
        <h3>Meus presets</h3>
        <p>Guarde estes ajustes para o próximo áudio neste navegador.</p>
      </div>
      <form onSubmit={save}>
        <label className="sr-only" htmlFor="preset-name">
          Nome do preset
        </label>
        <input
          id="preset-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do seu preset"
          maxLength={60}
          required
          disabled={disabled}
        />
        <button className="button secondary small" disabled={disabled || !name.trim()}>
          <Save size={14} /> Salvar preset
        </button>
      </form>
      {items.length > 0 && (
        <div className="saved-preset-list">
          {items.map((p) => (
            <div key={p.id}>
              <button
                className="text-link"
                disabled={disabled}
                onClick={() => {
                  onLoad(p);
                  setMessage(`Preset “${p.name}” carregado. Aplique para ouvir.`);
                }}
              >
                {p.name}
              </button>
              <button
                className="icon-button"
                disabled={disabled}
                aria-label={`Excluir preset ${p.name}`}
                onClick={() => persist(items.filter((i) => i.id !== p.id))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {message && (
        <p className="field-hint" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
