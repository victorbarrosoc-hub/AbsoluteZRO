'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Clock, Users, RefreshCw, Search, Settings2, X } from 'lucide-react';
import ProviderBalances from './provider-balances';
import { useDialog } from '@/lib/use-dialog';
import { allowance, minutes, price, type Plan } from '@/lib/plans';
type Member = {
  id: string;
  name: string;
  email: string;
  plan_id: string;
  assigned_plan_id?: string;
  plan_name: string;
  is_admin: boolean;
  blocked: boolean;
  limit_seconds: number;
  used_seconds: number;
  job_count: number;
  failed_count: number;
  uploaded_bytes: number;
  seconds_override: number | null;
  expires_at: string | null;
};
type Data = {
  plans: Plan[];
  users: Member[];
  totalUsers: number;
  page: number;
  days: { day: string; seconds: number; completed: number; failed: number }[];
  totals: {
    users: number;
    monthlySeconds: number;
    completed: number;
    failed: number;
    pending: number;
    runtimeSeconds: number;
    gpuUsdHour: number;
  };
};
async function save(action: string, data: unknown) {
  const response = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
}
function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [name, setName] = useState(plan.name),
    [quota, setQuota] = useState(String(plan.monthly_seconds / 60)),
    [value, setValue] = useState(String(plan.price_cents / 100)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="admin-plan-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await save('set_plan', {
            planId: plan.id,
            name,
            monthlySeconds: Math.round(Number(quota) * 60),
            priceCents: Math.round(Number(value) * 100),
          });
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{plan.name}</h3>
      <label>
        Nome do plano
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={40}
        />
      </label>
      <label>
        Minutos por mês
        <input
          type="number"
          min={0}
          max={14400}
          step={1}
          value={quota}
          onChange={(e) => setQuota(e.target.value)}
          required
        />
      </label>
      <label>
        Preço mensal · R$
        <input
          type="number"
          min={0}
          max={10000}
          step="0.01"
          disabled={plan.id === 'free'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </label>
      <p>
        {allowance(Number(quota) * 60)} · {price(Math.round(Number(value) * 100))}/mês
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button className="button secondary" disabled={busy}>
        {busy ? 'Salvando…' : 'Salvar plano'}
      </button>
    </form>
  );
}
export default function AdminDashboard() {
  const [data, setData] = useState<Data | null>(null),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Member | null>(null),
    [plan, setPlan] = useState('free'),
    [override, setOverride] = useState(''),
    [expires, setExpires] = useState(''),
    [blocked, setBlocked] = useState(false),
    [saving, setSaving] = useState(false),
    [gpuRate, setGpuRate] = useState('1.5');
  useDialog(!!editing);
  async function load(query = search, nextPage = page) {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/admin?search=${encodeURIComponent(query)}&page=${nextPage}`, {
        cache: 'no-store',
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
      setPage(nextPage);
      setGpuRate(String(d.totals.gpuUsdHour));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!editing) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setEditing(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [editing, saving]);
  const maximum = Math.max(60, ...(data?.days.map((d) => Number(d.seconds)) ?? []));
  const openMember = (user: Member) => {
    setEditing(user);
    setPlan(user.assigned_plan_id || user.plan_id);
    setOverride(user.seconds_override === null ? '' : String(user.seconds_override / 60));
    setExpires(user.expires_at?.slice(0, 10) || '');
    setBlocked(user.blocked);
    setMessage('');
  };
  const saved = () => {
    setMessage('Configuração salva.');
    void load();
  };
  return (
    <section className="admin-dashboard">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO NOSSOM</span>
          <h1>Seu negócio, em sintonia.</h1>
          <p>Planos, franquias e processamento de todos os usuários.</p>
        </div>
        <button className="button secondary" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={17} />
          Atualizar
        </button>
      </div>
      <ProviderBalances />
      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>
          <a className="text-link" href="/setup/cloud-restoration.sql" download>
            Baixar migração de configuração
          </a>
        </div>
      )}
      {message && (
        <p className="admin-success" role="status">
          {message}
        </p>
      )}
      {loading && !data && <p role="status">Carregando seus indicadores…</p>}
      {data && (
        <>
          <div className="admin-kpis">
            {[
              { icon: Users, name: 'Contas cadastradas', value: String(data.totals.users) },
              {
                icon: Clock,
                name: 'Minutos usados / reservados no mês',
                value: minutes(Number(data.totals.monthlySeconds)),
              },
              {
                icon: Activity,
                name: 'Restaurações concluídas no mês',
                value: String(data.totals.completed),
              },
              {
                icon: Clock,
                name: 'GPU estimada · USD',
                value: new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'USD',
                }).format(
                  (Number(data.totals.runtimeSeconds) * Number(data.totals.gpuUsdHour)) / 3600,
                ),
              },
            ].map((item) => (
              <article key={item.name}>
                <item.icon size={20} />
                <span>{item.name}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
          <div className="admin-overview">
            <section className="admin-chart">
              <div className="subheading">
                <div>
                  <h2>Minutos de restauração</h2>
                  <p>Últimos 30 dias · usados e reservados</p>
                </div>
                <span>{data.totals.pending} na fila</span>
              </div>
              <svg
                viewBox="0 0 1000 270"
                role="img"
                aria-label="Uso diário de minutos de restauração nos últimos 30 dias"
              >
                {[0, 1, 2, 3].map((i) => (
                  <g key={i}>
                    <line
                      x1={40}
                      x2={995}
                      y1={25 + i * 65}
                      y2={25 + i * 65}
                      stroke="currentColor"
                      opacity=".1"
                    />
                    <text x={0} y={30 + i * 65} fill="currentColor" fontSize={13}>
                      {minutes(maximum * (1 - i / 3))}
                    </text>
                  </g>
                ))}
                {data.days.map((day, i) => {
                  const height = Math.max(1, (Number(day.seconds) / maximum) * 190);
                  return (
                    <g key={day.day}>
                      <rect
                        x={45 + i * 31.5}
                        y={220 - height}
                        width={21}
                        height={height}
                        rx={5}
                        fill="#a4baff"
                      >
                        <title>
                          {day.day}: {minutes(Number(day.seconds))} minutos
                        </title>
                      </rect>
                      {i % 5 === 0 && (
                        <text x={45 + i * 31.5} y={250} fontSize={13} fill="currentColor">
                          {day.day.slice(8)}/{day.day.slice(5, 7)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </section>
            <section className="admin-cost">
              <h2>Consumo sob controle.</h2>
              <p>
                <strong>{data.totals.failed}</strong> falhas/cancelamentos no mês.{' '}
                <strong>{data.totals.pending}</strong> trabalhos pendentes.
              </p>
              <p>
                Tempo de execução informado pela RunPod:{' '}
                <strong>{minutes(Number(data.totals.runtimeSeconds))} min</strong>.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await save('set_cost', { usdPerHour: Number(gpuRate) });
                    saved();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <label>
                  Taxa estimada da GPU · US$/hora
                  <input
                    type="number"
                    min="0.01"
                    max={50}
                    step="0.01"
                    value={gpuRate}
                    onChange={(e) => setGpuRate(e.target.value)}
                    required
                  />
                </label>
                <button className="button secondary">Salvar taxa</button>
              </form>
              <small>
                Estimativa de planejamento, não uma fatura. Não inclui inicialização, espera ociosa,
                armazenamento ou tráfego. Use o preço Serverless atual da sua RunPod.
              </small>
            </section>
          </div>
          <section className="admin-members">
            <div className="subheading">
              <div>
                <h2>Contas e franquias</h2>
                <p>{data.totalUsers} contas encontradas</p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void load(search, 0);
                }}
              >
                <label className="sr-only" htmlFor="admin-search">
                  Buscar conta por nome ou e-mail
                </label>
                <input
                  id="admin-search"
                  placeholder="Nome ou e-mail"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={100}
                />
                <button className="icon-button" aria-label="Buscar contas">
                  <Search size={18} />
                </button>
              </form>
            </div>
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Plano</th>
                    <th>Uso do mês</th>
                    <th>Arquivos / falhas</th>
                    <th>Enviado à restauração</th>
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name || 'Conta NOSSOM'}</strong>
                        <span>{user.email}</span>
                      </td>
                      <td>
                        <span className="admin-plan-badge">
                          {user.is_admin ? 'ADM · Ilimitado' : user.plan_name}
                        </span>
                        {user.blocked && <small>GPU suspensa</small>}
                      </td>
                      <td>
                        <strong>{minutes(Number(user.used_seconds))} min</strong>
                        <span>
                          {user.is_admin
                            ? 'Sem limite'
                            : `de ${allowance(Number(user.limit_seconds))}`}
                        </span>
                        {!user.is_admin && (
                          <progress
                            max={Math.max(1, Number(user.limit_seconds))}
                            value={Number(user.used_seconds)}
                            aria-label={`Franquia usada por ${user.email}`}
                          />
                        )}
                      </td>
                      <td>
                        {user.job_count} / {user.failed_count}
                      </td>
                      <td>
                        {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(
                          Number(user.uploaded_bytes) / 1024 / 1024,
                        )}{' '}
                        MB
                      </td>
                      <td>
                        <button className="button secondary small" onClick={() => openMember(user)}>
                          <Settings2 size={15} />
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.users.length && <p>Nenhuma conta corresponde à busca.</p>}
            <div className="admin-pagination">
              <button
                className="button secondary small"
                disabled={page === 0 || loading}
                onClick={() => void load(search, page - 1)}
              >
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button
                className="button secondary small"
                disabled={(page + 1) * 25 >= data.totalUsers || loading}
                onClick={() => void load(search, page + 1)}
              >
                Próxima
              </button>
            </div>
          </section>
          <section className="admin-plans">
            <h2>Planos e limites mensais.</h2>
            <p>
              As alterações valem imediatamente. A ativação de planos pagos é manual; este painel
              não efetua cobranças.
            </p>
            <div>
              {data.plans.map((p) => (
                <PlanEditor
                  key={`${p.id}-${p.monthly_seconds}-${p.price_cents}-${p.name}`}
                  plan={p}
                  onSaved={saved}
                />
              ))}
            </div>
          </section>
        </>
      )}
      {editing &&
        createPortal(
          <div className="modal-backdrop" onClick={() => !saving && setEditing(null)}>
            <section
              className="admin-member-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={`Plano de ${editing.name || 'usuário'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="icon-button"
                aria-label="Fechar edição de plano"
                disabled={saving}
                onClick={() => setEditing(null)}
              >
                <X size={20} />
              </button>
              <h2 id="admin-member-title">Plano de {editing.name || 'usuário'}</h2>
              <p>{editing.email}</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  try {
                    await save('set_member', {
                      userId: editing.id,
                      planId: plan,
                      secondsOverride: override === '' ? null : Math.round(Number(override) * 60),
                      expiresAt: expires ? `${expires}T03:00:00Z` : null,
                      blocked,
                    });
                    setEditing(null);
                    saved();
                  } catch (e) {
                    setMessage((e as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <label>
                  Plano
                  <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                    {data?.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {allowance(p.monthly_seconds)}/mês
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Limite personalizado · minutos/mês
                  <input
                    type="number"
                    min={0}
                    max={14400}
                    step={1}
                    value={override}
                    placeholder="Usar o limite do plano"
                    onChange={(e) => setOverride(e.target.value)}
                  />
                </label>
                <label>
                  Válido até · opcional
                  <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
                </label>
                <p>
                  Sem data, mantém o plano até você alterar. Após vencer, volta ao Grátis. A
                  franquia renova no dia 1 e não apaga o consumo já feito neste mês.
                </p>
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={blocked}
                    onChange={(e) => setBlocked(e.target.checked)}
                  />
                  Suspender restauração na GPU
                </label>
                {editing.is_admin && (
                  <p>Sua conta ADM continua ilimitada, independentemente do plano selecionado.</p>
                )}
                {message && <p role="alert">{message}</p>}
                <button className="button primary" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar acesso'}
                </button>
              </form>
            </section>
          </div>,
          document.body,
        )}
    </section>
  );
}
