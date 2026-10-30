'use client';
import Link from 'next/link';
import AccountMenu from './account-menu';
import DesktopUpdates from './desktop-updates';
import AccountSettings from './account-settings';
import PlanPage from './plan-page';
import UpgradeOffer, { upgradeReason, upgradeTarget, type UpgradeReason } from './upgrade-offer';
import { usePathname, useSearchParams } from 'next/navigation';
import { visitStudio } from '@/lib/studio-navigation';
import StudioLink from './studio-link';
import {
  restorationD,
  singingSeparation,
  stemSeparation,
  transcription,
  voiceIsolator,
  type CloudPreset,
} from '@/lib/restoration';
import { toolPath, routeOperation, presetOperation } from '@/lib/studio-routes';
import { buildCues, toSrt, toText, toVtt } from '@/lib/transcript';
import { mixLabel, renderMix, type StemSetting } from '@/lib/stems';
import StemMixer from './stem-mixer';
import { activateVersion, activeIndex, previousIndex, nextIndex } from '@/lib/history';
import { EqualizerControls, BroadcastControls } from './preset-controls';
import AssistantHome from './assistant-home';
import ZroIaPanel from './zro-ia-panel';
import { rotuloSet, useSetZro } from './set-zro';
import AIMotion from './ai-motion';
import UserAvatar from './user-avatar';
import AdminDashboard from './admin-dashboard';
import { accountPlan, type Account } from '@/lib/accounts';
import { eqPresets, type EqGains } from '@/lib/equalizer';
import { freshBroadcast, type BroadcastSettings } from '@/lib/broadcast';
import PresetLibrary from './preset-library';
import type { SavedRecipe } from '@/lib/saved-presets';
import { voicePresets } from '@/lib/voice-presets';
import { effectPresets, type EffectId } from '@/lib/effects';
import { toolGroups } from '@/lib/workflow';
import InstallApp from './install-app';
import FamilyNav from './family-nav';
import NavBadge from './nav-badge';
import { studioPending } from '@/lib/studio-pending';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Gem,
  ArrowRight,
  ArrowLeft,
  Plus,
  AudioLines,
  Folder,
  House,
  Circle,
  Sparkles,
  SlidersHorizontal,
  Layers,
  Upload,
  Mic,
  Search,
  Clock,
  MoreHorizontal,
  Trash2,
  Download,
  Check,
  ChevronRight,
  X,
  Settings2,
  ShieldCheck,
  LoaderCircle,
  Square,
  FileAudio,
  Activity,
  Undo2,
  MessageCircle,
  UserRound,
  Menu,
  PenLine,
  Info,
  UsersRound,
} from 'lucide-react';
import { Brand } from './brand';
import { useDialog } from '@/lib/use-dialog';
import Assistant from './assistant';
import { WavePlayer } from './wave-player';
import { restoreCloud, releaseCloudJob, cancelCloudJob } from '@/lib/cloud-audio';
import { usageLabel, type AudioUsage } from '@/lib/usage';
import {
  operations,
  deliveryPresets,
  studioVoice,
  type Operation,
  type DenoiseMode,
} from '@/lib/presets';
import { estimateNoiseFloor } from '@/lib/noise-profile';
import {
  decode,
  importAudio,
  processAudio,
  encodeWav,
  inspect,
  measure,
  exportMp3,
  cloudSource,
  isVideoFile,
  muxVideo,
  makeDemo,
  download,
  formatTime,
  cancelProcessing,
  type Measurements,
} from '@/lib/audio';
import {
  listProjects,
  getProject,
  saveProject,
  deleteProject,
  type Project,
  type ProjectSummary,
  type Version,
} from '@/lib/storage';
const toolIcons = {
  auto: Sparkles,
  denoise: Sparkles,
  eq: SlidersHorizontal,
  clarity: Mic,
  wind: AudioLines,
  level: SlidersHorizontal,
  master: Activity,
  effects: AudioLines,
  mix: Layers,
};
function metric(value: number | null, suffix = '') {
  return value === null ? '—' : `${value.toFixed(1)}${suffix}`;
}
function date(value: number) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(value);
}
function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="audio-range">
      <span>
        {label}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={`${value}${unit}`}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="range-scale">
        <small>
          {min}
          {unit}
        </small>
        <small>
          {max}
          {unit}
        </small>
      </span>
    </label>
  );
}
export default function Studio({ account, zroIa = false }: { account: Account; zroIa?: boolean }) {
  const pathname = usePathname(),
    searchParams = useSearchParams();
  const requestedProjectId = searchParams.get('project');
  const routeTool = routeOperation(pathname);
  const [eqPreset, setEqPreset] = useState('neutral'),
    [eqGains, setEqGains] = useState<EqGains>([0, 0, 0, 0, 0]),
    [eqHighpass, setEqHighpass] = useState(30);
  const [masterRecipe, setMasterRecipe] = useState('podcast');
  const [automatic, setAutomatic] = useState(true);
  const [effect, setEffect] = useState<EffectId>('none'),
    [effectMix, setEffectMix] = useState(0);
  function selectEffect(id: EffectId) {
    setEffect(id);
    setEffectMix(effectPresets.find((p) => p.id === id)?.mix ?? 0);
    setIntensity(100);
  }
  const [broadcast, setBroadcast] = useState<BroadcastSettings>(freshBroadcast);
  const [voicePreset, setVoicePreset] = useState('dialogue'),
    [deess, setDeess] = useState(25),
    [hum, setHum] = useState(0);
  function selectEq(id: string) {
    const p = eqPresets.find((p) => p.id === id);
    if (!p) return;
    setEqPreset(id);
    setEqGains([...p.gains]);
    setEqHighpass(p.highpass);
  }
  function selectVoice(id: string) {
    const p = voicePresets.find((p) => p.id === id);
    if (!p) return;
    setAutomatic(false);
    setVoicePreset(id);
    setPresence(p.presence);
    setCompression(p.compression);
    setDeess(p.deess);
    setHum(p.hum);
    setIntensity(p.strength);
    setDenoiseMode('studio');
  }
  function selectMaster(id: string) {
    setMasterRecipe(id);
    if (id === 'broadcast') {
      setBroadcast(freshBroadcast());
      setIntensity(100);
      return;
    }
    if (id === studioVoice.id) {
      setTarget(studioVoice.lufs);
      setPeak(studioVoice.peak);
      setIntensity(100);
      return;
    }
    const p = deliveryPresets.find((p) => p.id === id);
    if (p) {
      setPreset(id);
      setTarget(p.lufs);
      setPeak(p.peak);
    }
    setIntensity(80);
    setCompression(id === 'social' ? 3 : 2);
  }

  const [denoiseMode, setDenoiseMode] = useState<DenoiseMode>('studio');
  const [noiseFloor, setNoiseFloor] = useState<number | null>(null);
  const [noiseReduction, setNoiseReduction] = useState(36);
  const [neuralAttenuation, setNeuralAttenuation] = useState(24);
  const [presence, setPresence] = useState(2);
  const [compression, setCompression] = useState(2);
  const [highpass, setHighpass] = useState(140);
  const [analysisNote, setAnalysisNote] = useState('');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('dark');
  // o Set, a aba em comum do ecossistema: some sem a conta Absolute ZRO com o escopo dele
  const { set: setZro, elemento: setElemento } = useSetZro(zroIa, theme);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nossom-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') setTheme(saved);
    } catch {
      /* The studio also works with preference storage disabled. */
    }
  }, []);
  function changeTheme(value: 'system' | 'light' | 'dark') {
    setTheme(value);
    try {
      localStorage.setItem('nossom-theme', value);
    } catch {
      /* Optional preference. */
    }
  }
  const [view, setView] = useState<
      'z' | 'home' | 'projects' | 'editor' | 'tool' | 'ai' | 'account' | 'plans' | 'admin'
    >(
      pathname === '/studio/z' && zroIa
        ? 'z'
        : pathname === '/studio/admin'
          ? 'admin'
          : pathname === '/studio/planos'
            ? 'plans'
            : pathname === '/studio/conta'
              ? 'account'
              : pathname === '/studio/ia'
                ? 'ai'
                : pathname === '/studio/projetos'
                  ? 'projects'
                  : routeTool
                    ? 'tool'
                    : 'home',
    ),
    [projects, setProjects] = useState<ProjectSummary[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [versionIndex, setVersionIndex] = useState(0);
  const [operation, setOperation] = useState<Operation>(routeTool ?? 'auto'),
    [intensity, setIntensity] = useState(100),
    [preset, setPreset] = useState('podcast'),
    [target, setTarget] = useState(-16),
    [peak, setPeak] = useState(-1),
    [advanced, setAdvanced] = useState(false),
    [search, setSearch] = useState('');
  const speechTool = operation === 'auto' || operation === 'denoise' || operation === 'clarity';
  const cloudOperation =
    operation === 'auto' ||
    operation === 'vocals' ||
    operation === 'transcribe' ||
    operation === 'remix';
  const [voiceMode, setVoiceMode] = useState<'speech' | 'singing'>('speech');
  const cloudPreset: CloudPreset =
    operation === 'transcribe'
      ? transcription.id
      : operation === 'remix'
        ? stemSeparation.id
        : operation !== 'vocals'
          ? restorationD.id
          : voiceMode === 'speech'
            ? voiceIsolator.id
            : singingSeparation.id;
  const autoEnabled = operation === 'auto' || (speechTool && automatic);
  const [busy, setBusy] = useState(''),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [assistant, setAssistant] = useState(false),
    [sidebar, setSidebar] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [dragging, setDragging] = useState(false),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [renaming, setRenaming] = useState(false),
    [newName, setNewName] = useState('');
  const [region, setRegion] = useState<{ start: number; end: number } | null>(null),
    [music, setMusic] = useState<{ blob: Blob; name: string } | null>(null),
    [musicGain, setMusicGain] = useState(0.25),
    [recording, setRecording] = useState(false),
    [recordSeconds, setRecordSeconds] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null),
    musicInput = useRef<HTMLInputElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    recordStream = useRef<MediaStream | null>(null),
    operationLock = useRef(false),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [upgradeOffer, setUpgradeOffer] = useState<UpgradeReason | null>(null);
  useDialog(!!deleteId || renaming || !!upgradeOffer);
  const [usage, setUsage] = useState<AudioUsage | null>(null);
  const [usageError, setUsageError] = useState('');
  const [cloudReady, setCloudReady] = useState<boolean | null>(null);
  const [pendingJob, setPendingJob] = useState<{
    id: string;
    status: string;
    projectId?: string;
    duration?: number;
    bytes?: number;
    createdAt?: string;
    preset?: CloudPreset;
  } | null>(null);
  const cloudAbort = useRef<AbortController | null>(null);
  async function refreshCloud() {
    try {
      const response = await fetch('/api/audio/jobs', { cache: 'no-store' });
      const data = await response.json();
      setCloudReady(response.ok && data.configured === true);
      let saved;
      try {
        saved = JSON.parse(localStorage.getItem('nossom-cloud:' + account.id) || 'null');
      } catch {
        /* No recoverable local mapping. */
      }
      const mappedId =
        saved?.id === data.pending?.id &&
        saved?.projectId &&
        (await getProject(saved.projectId, account.id))
          ? saved.projectId
          : undefined;
      setPendingJob(
        data.pending && !(saved?.id === data.pending.id && saved.saved)
          ? {
              ...data.pending,
              preset:
                data.pending.preset ?? (saved?.id === data.pending.id ? saved.preset : undefined),
              projectId: mappedId,
            }
          : null,
      );
    } catch {
      setCloudReady(false);
    }
  }
  async function recoverPendingAudio() {
    if (!pendingJob || busy) return;
    await run(async () => {
      if (projects.length >= 20)
        throw new Error('Libere espaço em Meus projetos antes de recuperar este áudio.');
      setBusy('Recuperando o áudio do seu pedido…');
      const response = await fetch(`/api/audio/jobs?id=${pendingJob.id}&source=1`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível recuperar o áudio.');
      if (
        !Array.isArray(data.downloadUrls) ||
        !data.downloadUrls.length ||
        data.downloadUrls.length > 5
      )
        throw new Error('O original não está disponível neste pedido.');
      const parts: Blob[] = [];
      for (const url of data.downloadUrls) {
        const part = await fetch(url, { cache: 'no-store' });
        if (!part.ok) throw new Error('Não foi possível recuperar o original. Tente novamente.');
        parts.push(await part.blob());
      }
      const original = new Blob(parts);
      if (original.size !== data.bytes)
        throw new Error('O original foi recebido incompleto. Tente novamente.');
      const file = new File([original], 'Áudio recuperado.wav');
      const { blob, info, metrics } = await importAudio(file, setBusy);
      const imported = { blob, info, metrics };
      if (Math.abs(imported.info.duration - data.duration) > 0.1)
        throw new Error('O original recebido não corresponde ao pedido.');
      const now = Date.now();
      const recovered: Project = {
        id: crypto.randomUUID(),
        name: 'Áudio em restauração',
        createdAt: now,
        updatedAt: now,
        originalFile: file,
        originalName: file.name,
        versions: [{ id: crypto.randomUUID(), label: 'Original', createdAt: now, ...imported }],
      };
      await saveProject(recovered, account.id);
      localStorage.setItem(
        'nossom-cloud:' + account.id,
        JSON.stringify({ id: pendingJob.id, projectId: recovered.id }),
      );
      setPendingJob({ ...pendingJob, projectId: recovered.id });
      setProject(recovered);
      setVersionIndex(0);
      setRegion(null);
      setMusic(null);
      const recoveredOperation = presetOperation(pendingJob.preset);
      setOperation(recoveredOperation);
      setView('editor');
      visitStudio(toolPath(recoveredOperation, recovered.id));
      await refresh();
      notify(
        'Original recuperado. Clique em Retomar restauração para acompanhar e salvar o resultado.',
      );
    });
  }
  async function refreshUsage() {
    try {
      const response = await fetch('/api/usage', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUsage(data);
      setUsageError('');
    } catch {
      setUsageError('Limite temporariamente indisponível');
    }
  }
  useEffect(() => {
    void refreshUsage();
    void refreshCloud();
    const focus = () => {
      void refreshUsage();
      // o balão de Meus projetos acompanha o pedido de restauração (pronto para salvar enquanto a pessoa estava
      // fora); durante um envio ou acompanhamento em andamento, quem atualiza o pedido é o próprio fluxo
      if (!cloudAbort.current) void refreshCloud();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('nossom-sidebar-collapsed') === 'true');
    } catch {}
  }, []);
  const pending = studioPending(pendingJob);
  function toggleNavigation() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem('nossom-sidebar-collapsed', String(next));
    } catch {}
  }
  useEffect(() => {
    const query = matchMedia('(max-width: 680px)');
    const update = () => {
      setMobile(query.matches);
      if (!query.matches) setSidebar(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!sidebar) return;
    document.querySelector<HTMLButtonElement>('.sidebar-close')?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();
    };
  }, [sidebar]);
  const version = project?.versions[versionIndex];
  // GPU results and remixes keep float32 at their own rate; local tools write PCM16 at 48 kHz.
  const cloudOutput = !!(
    version?.processing?.cloudRestoration ||
    version?.processing?.vocalSeparation ||
    version?.processing?.stems
  );
  const cloudRate = version?.processing?.stems
    ? 44100
    : (version?.processing?.vocalSeparation ?? version?.processing?.cloudRestoration)?.sampleRate;
  const selectedTool = operations.find((o) => o.id === operation)!;
  const transcriptCues = useMemo(
    () => (project?.transcript ? buildCues(project.transcript.words) : null),
    [project?.transcript],
  );
  useEffect(() => {
    let current = true;
    setSidebar(false);
    if (pathname === '/studio/z' && zroIa) {
      setView('z');
      return;
    }
    if (pathname === '/studio/admin') {
      setView('admin');
      return;
    }
    if (pathname === '/studio/conta') {
      setView('account');
      return;
    }
    if (pathname === '/studio/planos') {
      setView('plans');
      return;
    }
    if (pathname === '/studio/ia') {
      setView('ai');
      return;
    }
    if (pathname === '/studio/projetos') {
      setView('projects');
      return;
    }
    const tool = routeOperation(pathname);
    if (tool) {
      setOperation(tool);
      setView(project ? 'editor' : 'tool');
      const id = requestedProjectId;
      if (id && project?.id !== id)
        void getProject(id, account.id)
          .then((p) => {
            if (p && current) {
              setProject(p);
              setVersionIndex(activeIndex(p));
              setView('editor');
            }
          })
          .catch(() => {
            if (current) setError('Não foi possível abrir este projeto.');
          });
    } else setView('home');
    setSidebar(false);
    return () => {
      current = false;
    };
  }, [pathname, requestedProjectId, account.id, zroIa]);
  // Offer the next plan when the month's minutes run low or out: once per stage and month,
  // never during processing or over another dialog, and always when a job is refused for minutes.
  useEffect(() => {
    if (upgradeOffer || busy || recording || deleteId || renaming || view === 'plans') return;
    const reason = upgradeReason(usage);
    if (!reason || !usage) return;
    const key = `nossom:upgrade-offer:${account.id}:${usage.resetAt}:${reason}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return;
    }
    setUpgradeOffer(reason);
  }, [usage, busy, recording, deleteId, renaming, view, upgradeOffer, account.id]);
  useEffect(() => {
    if (error.includes('A franquia mensal não cobre este áudio') && upgradeTarget(usage))
      setUpgradeOffer('blocked');
  }, [error, usage]);
  useEffect(() => {
    const names: Record<string, string> = {
      '/studio': 'Seu estúdio',
      '/studio/inicio': 'Seu estúdio',
      '/studio/z': 'Z',
      '/studio/conta': 'Minha conta',
      '/studio/planos': 'Meu plano',
      '/studio/projetos': 'Meus projetos',
      '/studio/admin': 'Administração',
      '/studio/ia': 'Inteligência NOSSOM',
    };
    document.title = `${names[pathname] ?? operations.find((o) => o.id === routeOperation(pathname))?.label ?? 'Estúdio'} · NOSSOM`;
  }, [pathname]);
  useEffect(() => {
    listProjects(account.id)
      .then(setProjects)
      .catch(() =>
        setError('O armazenamento local está indisponível. Permita dados neste navegador.'),
      );
    const tool = new URLSearchParams(location.search).get('tool');
    if (operations.some((o) => o.id === tool)) {
      setOperation(tool as Operation);
      visitStudio(toolPath(tool as Operation), true);
    }
    return () => {
      recordStream.current?.getTracks().forEach((t) => t.stop());
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [recording]);
  useEffect(() => {
    if (recording && recordSeconds >= 600) recorder.current?.stop();
  }, [recordSeconds, recording]);
  useEffect(() => {
    if (!busy && !recording) return;
    const prevent = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [busy, recording]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAssistant(false);
        setDeleteId(null);
        setRenaming(false);
        setSidebar(false);
      }
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  function notify(text: string) {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 6000);
  }
  async function refresh() {
    setProjects(await listProjects(account.id));
  }
  async function run(task: () => Promise<void>) {
    if (operationLock.current || recording) return;
    operationLock.current = true;
    setError('');
    setProgress(0);
    setBusy('Preparando…');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.');
    } finally {
      setBusy('');
      setProgress(0);
      operationLock.current = false;
      cloudAbort.current = null;
      void refreshCloud();
      void refreshUsage();
    }
  }
  async function upload(file: File, requestedOperation?: Operation, inAssistant = false) {
    await run(async () => {
      if (projects.length >= 20)
        throw new Error(
          'Você chegou a 20 projetos locais. Exporte e exclua projetos antigos para liberar espaço.',
        );
      setBusy('Lendo seu áudio…');
      const { video, ...result } = await importAudio(file, setBusy);
      const now = Date.now();
      const created: Project = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ''),
        createdAt: now,
        updatedAt: now,
        originalFile: file,
        originalName: file.name,
        ...(video ? { hasVideo: true } : {}),
        versions: [{ id: crypto.randomUUID(), label: 'Original', createdAt: now, ...result }],
      };
      await saveProject(created, account.id);
      setProject(created);
      setVersionIndex(0);
      setRegion(null);
      setMusic(null);
      setView(inAssistant ? 'home' : 'editor');
      if (requestedOperation) setOperation(requestedOperation);
      if (!inAssistant) visitStudio(toolPath(requestedOperation ?? operation, created.id));
      await refresh();
      notify('Áudio importado. Seu original está preservado.');
    });
  }
  async function open(id: string) {
    if (busy || recording) return;
    try {
      const p = await getProject(id, account.id);
      if (p) {
        setProject(p);
        setVersionIndex(activeIndex(p));
        setRegion(null);
        setMusic(null);
        setView('editor');
        visitStudio(toolPath(operation, p.id));
      }
    } catch {
      setError('Não foi possível abrir esse projeto.');
    }
  }
  function navigate(next: 'z' | 'home' | 'projects' | 'editor') {
    setSidebar(false);
    if (busy || recording) return;
    setSidebar(false);
    visitStudio(
      next === 'projects'
        ? '/studio/projetos'
        : next === 'home'
          ? '/studio/inicio'
          : next === 'z'
            ? '/studio/z'
            : toolPath(operation, project?.id),
    );
  }
  function chooseTool(next: Operation) {
    if (busy || recording) return;
    setOperation(next);
    setSidebar(false);
    visitStudio(toolPath(next, project?.id));
  }
  async function selectVersion(index: number, action: 'select' | 'undo' | 'redo' = 'select') {
    if (!project || busy || recording || index < 0 || index >= project.versions.length) return;
    await run(async () => {
      const updated = activateVersion(project, index);
      if (action === 'undo')
        updated.redoVersionIds = [
          project.versions[versionIndex].id,
          ...(project.redoVersionIds ?? []),
        ];
      else if (action === 'redo')
        updated.redoVersionIds =
          project.redoVersionIds?.[0] === project.versions[index].id
            ? project.redoVersionIds.slice(1)
            : [];
      await saveProject(updated, account.id);
      setProject(updated);
      setVersionIndex(index);
      await refresh();
      notify(
        index === 0
          ? 'Original restaurado. O histórico continua disponível.'
          : 'Versão ativa alterada. Você pode refazer pelo histórico.',
      );
    });
  }
  function loadSavedPreset(p: SavedRecipe) {
    setAutomatic(p.settings.automatic === true);
    setIntensity(Math.max(0, Math.min(100, p.intensity)));
    setDenoiseMode(p.mode);
    setTarget(Math.max(-30, Math.min(-10, p.target)));
    setPeak(Math.max(-6, Math.min(-1, p.peak)));
    setMusicGain(Math.max(0, Math.min(1, p.musicGain)));
    const s = p.settings;
    setNoiseFloor(s.noiseFloor ?? null);
    setNoiseReduction(s.noiseReduction ?? 36);
    setNeuralAttenuation(s.neuralAttenuation ?? 24);
    setPresence(s.presence ?? 2);
    setCompression(s.compression ?? 2);
    setHighpass(s.highpass ?? 140);
    setDeess(s.deess ?? 25);
    setHum(s.hum ?? 0);
    setEffect(s.effect ?? 'none');
    setEffectMix(s.effectMix ?? 0);
    setVoicePreset('custom');
    if (s.eq) {
      setEqGains(s.eq);
      setEqHighpass(s.highpass ?? 30);
      setEqPreset('custom');
    }
    if (s.masterPreset) {
      setMasterRecipe(s.masterPreset);
      if (deliveryPresets.some((p) => p.id === s.masterPreset)) setPreset(s.masterPreset);
    }
    if (s.broadcast) setBroadcast(structuredClone(s.broadcast));
  }
  /** After the result is saved locally: mark it saved, then free the private copies. */
  async function finishCloudJob(id: string, projectId: string) {
    localStorage.setItem(
      'nossom-cloud:' + account.id,
      JSON.stringify({ id, projectId, saved: true }),
    );
    await releaseCloudJob(id)
      .then(() => localStorage.removeItem('nossom-cloud:' + account.id))
      .catch(() => {});
    setPendingJob(null);
  }
  async function applyTreatment() {
    if (!project || !version) return;
    await run(async () => {
      if (operation !== 'transcribe' && operation !== 'remix' && project.versions.length >= 9)
        throw new Error(
          'Limite de 8 tratamentos por projeto. Exporte o resultado para iniciar outro projeto.',
        );
      if (operation === 'mix' && !music)
        throw new Error('Envie uma faixa de música antes de mixar.');
      if (operation === 'mix' && region)
        throw new Error('Para mixar, desative a seleção de trecho. A mixagem usa o áudio inteiro.');
      const effectBase =
        operation === 'effects' && version.operation === 'effects'
          ? (project.versions.find((v) => v.id === version.parentId) ?? version)
          : version;
      const inputVersion = cloudOperation || autoEnabled ? project.versions[0] : effectBase;
      let cloudId: string | undefined;
      let result: Pick<Version, 'blob' | 'info' | 'metrics' | 'processing'>;
      if (cloudOperation) {
        if (!cloudReady)
          throw new Error(
            'A restauração avançada está sendo conectada. Você pode usar as ferramentas de limpeza local e acabamento.',
          );
        if (pendingJob && pendingJob.projectId !== project.id)
          throw new Error(
            'Há outro áudio em processamento. Retome ou cancele o pedido anterior antes de continuar.',
          );
        const controller = new AbortController();
        cloudAbort.current = controller;
        const original = project.versions[0];
        const sendSource = () => {
          if (project.hasVideo || isVideoFile(project.originalFile))
            setBusy('Separando o áudio do vídeo para enviar só o som…');
          return cloudSource(project.originalFile, original.blob, original.info.peak);
        };
        const cloud = await restoreCloud(sendSource, original.info.duration, {
          preset: cloudPreset,
          resumeId: pendingJob?.id,
          signal: controller.signal,
          onStatus: setBusy,
          onProgress: setProgress,
          onUsage: setUsage,
          onJob: (id) => {
            if (id) {
              localStorage.setItem(
                'nossom-cloud:' + account.id,
                JSON.stringify({
                  id,
                  projectId: project.id,
                  preset: cloudPreset,
                }),
              );
              setPendingJob({
                id,
                projectId: project.id,
                status: 'queued',
                preset: cloudPreset,
              });
            }
          },
        });
        cloudId = cloud.id;
        cloudAbort.current = null;
        if (cloud.kind === 'transcript') {
          const transcribed = {
            ...project,
            updatedAt: Date.now(),
            transcript: { ...cloud.transcript, createdAt: Date.now() },
          };
          await saveProject(transcribed, account.id);
          setProject(transcribed);
          await refresh();
          await finishCloudJob(cloud.id, project.id);
          notify('Legendas prontas. Baixe em SRT, VTT ou TXT.');
          return;
        }
        if (cloud.kind === 'stems') {
          const separated = {
            ...project,
            updatedAt: Date.now(),
            stems: { files: cloud.files, gainDb: cloud.gainDb, createdAt: Date.now() },
          };
          await saveProject(separated, account.id);
          setProject(separated);
          await refresh();
          await finishCloudJob(cloud.id, project.id);
          notify('Faixas separadas. Mexa nos faders e ouça.');
          return;
        }
        result = {
          blob: cloud.blob,
          info: cloud.info,
          metrics: cloud.metrics,
          processing: cloud.processing,
        };
        cloudAbort.current = null;
      } else {
        setBusy('Autorizando seu tratamento…');
        const authorization = await fetch('/api/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation }),
        });
        const nextUsage = await authorization.json();
        if (typeof nextUsage.used === 'number') setUsage(nextUsage);
        if (!authorization.ok)
          throw new Error(nextUsage.error || 'Não foi possível autorizar o tratamento.');
        result = await processAudio(inputVersion.blob, {
          operation,
          intensity,
          mode: denoiseMode,
          settings: {
            automatic: autoEnabled,
            noiseFloor: noiseFloor ?? version.info.noiseFloor,
            noiseReduction,
            neuralAttenuation,
            presence,
            compression,
            highpass: operation === 'eq' ? eqHighpass : highpass,
            eq: operation === 'eq' ? eqGains : undefined,
            masterPreset: operation === 'master' ? masterRecipe : undefined,
            broadcast:
              operation === 'master' && masterRecipe === 'broadcast' ? broadcast : undefined,
            deess: operation === 'clarity' ? deess : undefined,
            hum: operation === 'clarity' ? hum : undefined,
            effect: operation === 'effects' ? effect : undefined,
            effectMix: operation === 'effects' ? effectMix : undefined,
          },
          target,
          peak,
          music: music?.blob,
          musicGain,
          region: region ?? undefined,
          onStatus: setBusy,
          onProgress: setProgress,
        });
      }
      const newVersion: Version = {
        id: crypto.randomUUID(),
        parentId: inputVersion.id,
        label: `${selectedTool.label} · V${project.versions.length}`,
        createdAt: Date.now(),
        operation,
        preset:
          operation === 'vocals'
            ? result.processing?.vocalSeparation?.preset === voiceIsolator.id
              ? 'Voz isolada'
              : 'Vocais separados da música'
            : operation === 'auto'
              ? 'Voz restaurada com IA'
              : operation === 'master'
                ? masterRecipe === 'broadcast'
                  ? 'Transmissão + Limite −3 dB'
                  : masterRecipe === studioVoice.id
                    ? `${studioVoice.label} / alvo ${target} LUFS / pico ${peak} dBTP / ${studioVoice.version}`
                    : `${preset} / alvo ${target} LUFS / pico ${peak} dBTP / v2`
                : operation === 'effects'
                  ? `${effectPresets.find((p) => p.id === effect)?.label} · ${effectMix}%`
                  : operation === 'eq'
                    ? `EQ: ${eqPresets.find((p) => p.id === eqPreset)?.label ?? 'Personalizado'}`
                    : operation === 'clarity'
                      ? `Voz: ${voicePresets.find((p) => p.id === voicePreset)?.label ?? 'Personalizado'}`
                      : undefined,
        ...result,
      };
      const updated = {
        ...project,
        updatedAt: Date.now(),
        versions: [...project.versions, newVersion],
        activeVersionId: newVersion.id,
        redoVersionIds: [],
      };
      await saveProject(updated, account.id);
      setProject(updated);
      setVersionIndex(updated.versions.length - 1);
      await refresh();
      if (cloudId) {
        await finishCloudJob(cloudId, project.id);
        notify(
          operation === 'vocals'
            ? result.processing?.vocalSeparation?.preset === voiceIsolator.id
              ? 'Voz isolada. Compare com o original e baixe.'
              : 'Vocal separado. Compare com a música e baixe.'
            : 'Voz restaurada. Ouça e escolha o acabamento abaixo.',
        );
      } else notify('Nova versão salva. Compare com o original.');
    });
  }
  async function addMusic(file: File) {
    await run(async () => {
      const result = await importAudio(file, setBusy);
      setMusic({ blob: result.blob, name: file.name });
      notify('Trilha adicionada à mixagem.');
    });
  }
  async function exportAudio(format: 'wav' | 'mp3') {
    if (!project || !version) return;
    await run(async () => {
      setBusy(`Preparando ${format.toUpperCase()}…`);
      const blob = format === 'wav' ? version.blob : await exportMp3(version.blob);
      download(blob, `${project.name}-v${versionIndex}.${format}`);
      notify('Seu download está pronto.');
    });
  }
  async function renderRemix(settings: StemSetting[]) {
    if (!project?.stems) return;
    const stems = project.stems;
    await run(async () => {
      if (project.versions.length >= 9)
        throw new Error(
          'Limite de 8 tratamentos por projeto. Exporte o resultado para iniciar outro projeto.',
        );
      setBusy('Mixando as faixas…');
      const buffer = await renderMix(stems.files, settings, stems.gainDb);
      const blob = encodeWav(buffer, true),
        info = inspect(buffer),
        metrics = await measure(blob, setBusy);
      const created: Version = {
        id: crypto.randomUUID(),
        parentId: project.versions[0].id,
        label: `${selectedTool.label} · V${project.versions.length}`,
        createdAt: Date.now(),
        operation: 'remix',
        preset: mixLabel(settings),
        blob,
        info,
        metrics,
        processing: {
          engine: 'Mel-Band RoFormer + HTDemucs 6s · remix local',
          strength: 100,
          noiseFloor: info.noiseFloor ?? -60,
          mode: 'local',
          stems: settings,
        },
      };
      const updated = {
        ...project,
        updatedAt: Date.now(),
        versions: [...project.versions, created],
        activeVersionId: created.id,
        redoVersionIds: [],
      };
      await saveProject(updated, account.id);
      setProject(updated);
      setVersionIndex(updated.versions.length - 1);
      await refresh();
      notify(`${mixLabel(settings)}: nova versão salva. Baixe em WAV ou MP3.`);
    });
  }
  function exportTranscript(format: 'srt' | 'vtt' | 'txt') {
    if (!project?.transcript || !transcriptCues) return;
    const content =
      format === 'srt'
        ? toSrt(transcriptCues)
        : format === 'vtt'
          ? toVtt(transcriptCues)
          : toText(project.transcript.words);
    const type =
      format === 'vtt' ? 'text/vtt' : format === 'srt' ? 'application/x-subrip' : 'text/plain';
    download(new Blob([content], { type: type + ';charset=utf-8' }), `${project.name}.${format}`);
    notify('Seu download está pronto.');
  }
  async function exportVideo() {
    if (!project || !version) return;
    await run(async () => {
      setBusy('Colocando o som novo no vídeo…');
      const blob = await muxVideo(project.originalFile, project.originalName, version.blob);
      const extension = project.originalName.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp4';
      download(blob, `${project.name}-v${versionIndex}.${extension.toLowerCase()}`);
      notify('Vídeo pronto, com o som novo.');
    });
  }
  function report() {
    if (!project || !version) return;
    const body = {
      product: 'NOSSOM',
      reportVersion: '2.0',
      activeVersionId: version.id,
      algorithm: 'FFmpeg loudnorm / EBU R128 measurement',
      createdAt: new Date().toISOString(),
      project: project.name,
      source: project.originalName,
      version: version.label,
      processingPreset: version.preset ?? null,
      processingSettings: version.processing ?? null,
      output: {
        format: cloudOutput ? 'WAV float32' : 'WAV PCM 16-bit',
        sampleRate: version.info.sampleRate,
        channels: version.info.channels,
        duration: version.info.duration,
      },
      before: project.versions[0].metrics,
      after: version.metrics,
      clippedSamples: version.info.clipped,
      samplePeakDbfs: Number.isFinite(version.info.peak) ? version.info.peak : null,
      history: project.versions.map((v) => ({
        label: v.label,
        operation: v.operation ?? 'import',
        parentId: v.parentId ?? null,
        processing: v.processing ?? null,
        preset: v.preset ?? null,
        createdAt: new Date(v.createdAt).toISOString(),
      })),
      notice:
        'Medições do WAV renderizado. Não constitui certificação de entrega. Metas e tolerâncias devem ser acordadas com o destinatário.',
    };
    download(
      new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }),
      `${project.name}-relatorio.json`,
    );
    notify('Relatório JSON exportado.');
  }
  async function remove() {
    if (!deleteId) return;
    try {
      await deleteProject(deleteId, account.id);
      if (project?.id === deleteId) {
        setProject(null);
        setView('projects');
      }
      setDeleteId(null);
      await refresh();
      notify('Projeto excluído deste navegador.');
    } catch {
      setError('Não foi possível excluir o projeto.');
    }
  }
  async function rename() {
    if (!project || !newName.trim()) return;
    try {
      const updated = { ...project, name: newName.trim().slice(0, 100), updatedAt: Date.now() };
      await saveProject(updated, account.id);
      setProject(updated);
      await refresh();
      setRenaming(false);
    } catch {
      setError('Não foi possível salvar o nome.');
    }
  }
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (busy) return;
    setError('');
    if (projects.length >= 20) {
      setError('Limite de 20 projetos locais. Exporte e exclua projetos antigos para continuar.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      recordStream.current = stream;
      const media = new MediaRecorder(stream),
        chunks: BlobPart[] = [];
      recorder.current = media;
      media.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      media.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const file = new File(chunks, `Gravação ${new Date().toISOString().slice(0, 10)}.webm`, {
          type: media.mimeType,
        });
        setTimeout(() => {
          operationLock.current = false;
          void importRecording(file);
        }, 0);
      };
      media.start(1000);
      setRecordSeconds(0);
      setRecording(true);
    } catch {
      setError('Não foi possível acessar o microfone. Confira a permissão no navegador.');
    }
  }
  async function importRecording(file: File) {
    operationLock.current = true;
    setBusy('Preparando gravação…');
    try {
      const { blob, info, metrics } = await importAudio(file, setBusy);
      const result = { blob, info, metrics };
      const now = Date.now();
      const p: Project = {
        id: crypto.randomUUID(),
        name: `Gravação ${date(now)}`,
        createdAt: now,
        updatedAt: now,
        originalFile: file,
        originalName: file.name,
        versions: [{ id: crypto.randomUUID(), label: 'Original', createdAt: now, ...result }],
      };
      await saveProject(p, account.id);
      setProject(p);
      setVersionIndex(0);
      setRegion(null);
      setMusic(null);
      setView('editor');
      const recordingTool = routeTool ?? 'auto';
      setOperation(recordingTool);
      visitStudio(toolPath(recordingTool, p.id));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar gravação.');
    } finally {
      setBusy('');
      operationLock.current = false;
    }
  }
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const renderProject = (p: ProjectSummary) => (
    <div className="project-row" key={p.id}>
      <button className="project-open" onClick={() => open(p.id)} disabled={!!busy || recording}>
        <span className="project-icon">
          <AudioLines size={21} />
        </span>
        <span>
          <strong>{p.name}</strong>
          <small>
            {formatTime(p.duration)} · {p.versionCount}{' '}
            {p.versionCount === 1 ? 'versão' : 'versões'}
          </small>
        </span>
        <span className="project-date">{date(p.updatedAt)}</span>
        <span className="project-status">
          <span /> Salvo localmente
        </span>
        <ChevronRight size={17} />
      </button>
      <button
        className="icon-button delete-button"
        aria-label={`Excluir ${p.name}`}
        disabled={!!busy || recording}
        onClick={() => setDeleteId(p.id)}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
  return (
    <div
      className={`studio-shell ${collapsed ? 'nav-collapsed' : ''} ${routeTool ? `tool-editor tool-${routeTool}` : ''} ${view === 'z' ? 'view-z' : ''}`}
      data-theme={theme}
    >
      {setElemento}
      <a className="skip-link" href="#studio-main">
        Pular para o estúdio
      </a>
      {sidebar && (
        <button
          className="sidebar-backdrop"
          onClick={() => setSidebar(false)}
          aria-label="Fechar navegação ao tocar fora"
        />
      )}
      <aside
        id="studio-navigation"
        className={`studio-sidebar ${sidebar ? 'open' : ''}`}
        inert={mobile ? !sidebar : collapsed}
      >
        <button
          className="icon-button sidebar-close"
          aria-label="Fechar navegação"
          onClick={() => setSidebar(false)}
        >
          <X size={20} />
        </button>
        <Link href="/" aria-label="NOSSOM página inicial">
          <Brand />
        </Link>
        <div className="workspace-label">
          <UserAvatar account={account} className="workspace-avatar" />
          <div>
            <strong className="workspace-name" title={account.name}>
              {account.name}
            </strong>
            <span className="account-plan">{accountPlan(account, usage)}</span>
            <small title={account.email}>{account.email}</small>
          </div>
          <span className="local-badge">{account.isAdmin ? 'ADM' : 'CONTA'}</span>
        </div>
        {!account.isAdmin && (
          <div className="weekly-usage" role="status">
            <span>{usage ? usageLabel(usage) : usageError || 'Consultando tratamentos…'}</span>
            {usage && !usage.unlimited && (
              <>
                <progress
                  max={Math.max(1, usage.limit ?? 300)}
                  value={usage.used}
                  aria-label="Minutos da franquia usados ou reservados neste mês"
                />
                <small>
                  Renova dia{' '}
                  {Number.isFinite(Date.parse(usage.resetAt))
                    ? new Intl.DateTimeFormat('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        timeZone: 'America/Fortaleza',
                      }).format(new Date(usage.resetAt))
                    : '1 do próximo mês'}
                  , à 0h · Brasília
                </small>
              </>
            )}
            {usageError && (
              <button className="text-link" onClick={refreshUsage}>
                Tentar novamente
              </button>
            )}
            {usage && (
              <StudioLink
                href="/studio/planos"
                className="usage-upgrade"
                onClick={() => setSidebar(false)}
              >
                {!usage.planId || usage.planId === 'free' ? 'Fazer upgrade' : 'Ver meu plano'}
                <ArrowUpRight size={13} />
              </StudioLink>
            )}
          </div>
        )}
        <button
          className="button primary new-project"
          onClick={() => fileInput.current?.click()}
          disabled={!!busy || recording}
        >
          <Plus size={17} /> Novo projeto
        </button>
        <nav aria-label="Navegação do estúdio">
          <button
            className={view === 'home' || view === 'ai' ? 'active' : ''}
            onClick={() => navigate('home')}
          >
            <House size={18} /> Início
          </button>
          <button
            className={view === 'projects' ? 'active' : ''}
            onClick={() => navigate('projects')}
            title={pending.projects.title || undefined}
          >
            <Folder size={18} /> Meus projetos
            {pending.projects.count ? (
              <NavBadge count={pending.projects.count} />
            ) : (
              <small>{projects.length}</small>
            )}
          </button>
          <button
            className={routeTool ? 'active' : ''}
            onClick={() => chooseTool(operation)}
            disabled={!!busy || recording}
          >
            <AudioLines size={18} /> Estúdio
          </button>
          <button
            className={view === 'account' ? 'active' : ''}
            onClick={() => {
              setSidebar(false);
              if (!busy && !recording) visitStudio('/studio/conta');
            }}
          >
            <UserRound size={18} /> Minha conta
          </button>
          <button
            className={view === 'plans' ? 'active' : ''}
            onClick={() => {
              setSidebar(false);
              if (!busy && !recording) visitStudio('/studio/planos');
            }}
          >
            <Gem size={18} /> {account.isAdmin ? 'Planos' : 'Meu plano'}
          </button>
          {account.isAdmin && (
            <button
              className={view === 'admin' ? 'active' : ''}
              disabled={!!busy || recording}
              onClick={() => {
                setSidebar(false);
                visitStudio('/studio/admin');
              }}
            >
              <Activity size={18} />
              Administração
            </button>
          )}
          {/* o Set (a entrada em comum do ecossistema) abre a folha dele; não é tela nem a entrada */}
          {setZro.visivel && (
            <button
              className={setZro.aberto ? 'active' : ''}
              aria-haspopup="dialog"
              aria-expanded={setZro.aberto}
              aria-label={rotuloSet(setZro)}
              title="Quem está online e as conversas"
              data-set=""
              onClick={() => {
                setSidebar(false);
                setZro.alternar();
              }}
            >
              <UsersRound size={18} /> Set
              {setZro.novidades ? <NavBadge count={setZro.novidades} /> : null}
            </button>
          )}
          {/* a Z, discreta (titular, 29/10/2026; Plano de Integração §7–8): por último, nunca a primeira nem a entrada */}
          {zroIa && (
            <button className={view === 'z' ? 'active' : ''} onClick={() => navigate('z')}>
              <Circle size={18} strokeWidth={1.5} /> Z
            </button>
          )}
        </nav>
        <FamilyNav onOpen={() => setSidebar(false)} />
        <div className="sidebar-bottom">
          <InstallApp onOpen={() => setSidebar(false)} />
          <Link
            href="/apps"
            className="sidebar-apps-link"
            aria-label="Aplicativos para Mac e Windows"
          >
            <Download size={18} />{' '}
            <span>
              Aplicativos<small>Mac e Windows</small>
            </span>
          </Link>
          <div className="local-note">
            <ShieldCheck size={17} />
            <div>Originais preservados.</div>
          </div>
          <Link href="/privacidade">
            Privacidade <ArrowUpRight size={13} />
          </Link>
        </div>
      </aside>
      <div className="studio-body" inert={mobile && sidebar}>
        <header className="studio-header">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
              onClick={() => setSidebar(!sidebar)}
              aria-expanded={sidebar}
              aria-controls="studio-navigation"
            >
              <Menu size={20} />
            </button>
            <button
              className="icon-button desktop-nav-toggle"
              aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
              aria-expanded={!collapsed}
              aria-controls="studio-navigation"
              onClick={toggleNavigation}
              title={collapsed && pending.projects.title ? pending.projects.title : undefined}
            >
              <Menu size={18} />
              {collapsed && <NavBadge count={pending.projects.count} corner />}
            </button>
            <span>Meu espaço</span>
            <ChevronRight size={12} />
            {routeTool ? (
              <select
                className="tool-switcher"
                aria-label="Ferramenta do estúdio"
                value={operation}
                disabled={!!busy || recording}
                onChange={(e) => chooseTool(e.target.value as Operation)}
              >
                {toolGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.tools.map((id) => (
                      <option key={id} value={id}>
                        {operations.find((o) => o.id === id)!.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <strong>
                {view === 'z'
                  ? 'Z'
                  : view === 'ai'
                    ? 'Assistente'
                    : view === 'projects'
                      ? 'Meus projetos'
                      : view === 'admin'
                        ? 'Administração'
                        : view === 'account'
                          ? 'Minha conta'
                          : view === 'plans'
                            ? 'Meu plano'
                            : 'Assistente'}
              </strong>
            )}
          </div>
          <div className="studio-header-actions">
            <DesktopUpdates blocked={!!busy || recording || renaming || !!deleteId} />
            {/* a Z no topo (computador e celular): um anel discreto, nunca uma aba nem a tela de entrada */}
            {zroIa && (
              <button
                className={`icon-button z-top ${view === 'z' ? 'active' : ''}`}
                aria-label="Z, a IA da Absolute ZRO"
                title="Z, a IA da Absolute ZRO"
                aria-current={view === 'z' ? 'page' : undefined}
                onClick={() => navigate('z')}
              >
                <Circle size={17} strokeWidth={1.6} />
              </button>
            )}
            <AccountMenu account={account} usage={usage} disabled={!!busy || recording} />
            <label className="theme-control">
              <span className="sr-only">Tema do estúdio</span>
              <select
                aria-label="Tema do estúdio"
                value={theme}
                onChange={(e) => changeTheme(e.target.value as 'system' | 'light' | 'dark')}
              >
                <option value="system">Tema do aparelho</option>
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
            </label>
            <button
              className="assistant-top"
              aria-label="Assistente NOSSOM"
              onClick={() => setAssistant(true)}
            >
              <AudioLines size={17} />
              <span>Assistente NOSSOM</span>
              <span className="keycap">↗</span>
            </button>
          </div>
        </header>
        <main id="studio-main" className="studio-main">
          {pendingJob && ['home', 'projects', 'ai'].includes(view) && (
            <section className="cloud-pending-short" aria-label="Pedido de áudio pendente">
              <div>
                <strong>
                  {pendingJob.status === 'completed'
                    ? 'Seu resultado está pronto para salvar'
                    : 'Você tem um pedido de restauração pendente'}
                </strong>
                <p>Abra o pedido para acompanhar o estado e salvar o resultado.</p>
              </div>
              {pendingJob.projectId ? (
                <StudioLink
                  className="button secondary"
                  href={toolPath(presetOperation(pendingJob.preset), pendingJob.projectId)}
                >
                  Abrir áudio do pedido <ArrowRight size={15} />
                </StudioLink>
              ) : (
                <button
                  className="button secondary"
                  disabled={!!busy || pendingJob.status === 'uploading'}
                  onClick={() => void recoverPendingAudio()}
                >
                  Recuperar áudio deste pedido <ArrowRight size={15} />
                </button>
              )}
            </section>
          )}
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            aria-label="Importar arquivo de áudio"
            accept="audio/*,video/mp4,video/quicktime,.m4a,.flac,.mov,.webm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              // The address already names the tool while the screen may still be catching up.
              const tool = routeOperation(location.pathname);
              const inAssistant = !tool && (view === 'home' || view === 'ai');
              if (f) void upload(f, inAssistant ? undefined : (tool ?? operation), inAssistant);
            }}
          />
          <input
            ref={musicInput}
            className="sr-only"
            type="file"
            aria-label="Importar trilha de música"
            accept="audio/*,.m4a,.flac"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void addMusic(f);
            }}
          />
          <div className="mobile-usage" role="status">
            {usage
              ? usage.unlimited
                ? 'ADM · restaurações ilimitadas'
                : usageLabel(usage)
              : usageError || 'Consultando seu saldo…'}
            {usage && !usage.unlimited && view !== 'plans' && (
              <StudioLink href="/studio/planos" className="usage-upgrade">
                {!usage.planId || usage.planId === 'free' ? 'Upgrade' : 'Meu plano'}
                <ArrowUpRight size={12} />
              </StudioLink>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dispensar erro"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="processing-banner" role="status">
              <div className="processing-wave" aria-hidden="true">
                <AIMotion state="thinking" compact />
              </div>
              <LoaderCircle className="spin" size={19} />
              <div>
                <strong>{busy}</strong>
                <small>
                  {progress > 0 ? `${progress}% · ` : ''}O original está preservado. Mantenha esta
                  aba aberta.
                </small>
              </div>
              {progress !== 0 && (
                <progress
                  value={progress < 0 ? undefined : progress}
                  max={100}
                  aria-label={
                    progress < 0
                      ? 'Etapa em andamento, sem percentual disponível'
                      : 'Progresso da etapa atual'
                  }
                />
              )}
              <button
                className="text-link"
                onClick={() => {
                  if (cloudAbort.current) {
                    setBusy('Solicitando cancelamento…');
                    cloudAbort.current.abort();
                  } else {
                    cancelProcessing();
                    setError(
                      'Processamento cancelado. O original e as versões salvas foram preservados.',
                    );
                  }
                }}
              >
                Cancelar
              </button>
            </div>
          )}
          {view === 'admin' &&
            (account.isAdmin ? <AdminDashboard /> : <p>Acesso restrito ao administrador.</p>)}
          {view === 'tool' && (
            <>
              <div className="studio-welcome">
                <div>
                  <span className="eyebrow">TUDO ACONTECE NO SOM</span>
                  <h1>{selectedTool.label}</h1>
                  <p>
                    {view === 'tool'
                      ? selectedTool.description
                      : 'Grave uma ideia, cuide do som e prepare a próxima entrega.'}
                  </p>
                </div>
                <div className="workspace-indicator">
                  <span className="status-light" /> Seu estúdio está aberto
                </div>
              </div>
              <div className="studio-start-grid">
                <section
                  className={`upload-zone ${dragging ? 'dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f && !busy && !recording) void upload(f);
                  }}
                >
                  <span className="upload-icon">
                    <Upload size={25} strokeWidth={1.4} />
                  </span>
                  <h2>Vamos dar o primeiro play.</h2>
                  <p>Arraste um arquivo ou escolha por onde começar.</p>
                  <div className="upload-actions">
                    <button
                      className="button primary"
                      disabled={!!busy || recording}
                      onClick={() => fileInput.current?.click()}
                    >
                      <Plus size={16} /> Enviar áudio
                    </button>
                    <button
                      className={`button secondary ${recording ? 'recording' : ''}`}
                      onClick={record}
                      disabled={!!busy}
                    >
                      {recording ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}{' '}
                      {recording ? `Finalizar · ${formatTime(recordSeconds)}` : 'Gravar uma ideia'}
                    </button>
                  </div>
                  <span className="upload-formats">Áudio ou vídeo · até 10 min</span>
                </section>
                <aside className="studio-start-guide">
                  <span className="eyebrow">DO ARQUIVO AO ÁUDIO PRONTO</span>
                  <h2>Um passo de cada vez.</h2>
                  <ol>
                    <li>
                      <span>1</span>
                      <div>
                        <strong>Traga o seu áudio</strong>
                        <p>Importe um arquivo ou grave aqui.</p>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <strong>Deixe a IA cuidar do som</strong>
                        <p>Comece pelo tratamento completo e compare com o original.</p>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>Prepare a entrega</strong>
                        <p>Escolha o destino e baixe em WAV ou MP3.</p>
                      </div>
                    </li>
                  </ol>
                </aside>
              </div>
              <div className="studio-lower">
                <section className="recent-projects">
                  <div className="subheading">
                    <h2>Projetos recentes</h2>
                    <button className="text-link" onClick={() => navigate('projects')}>
                      Ver todos <ArrowRight size={13} />
                    </button>
                  </div>
                  {projects.length ? (
                    projects.slice(0, 4).map(renderProject)
                  ) : (
                    <div className="empty-projects">
                      <span className="empty-icon">
                        <Folder size={25} strokeWidth={1.2} />
                      </span>
                      <h3>Um espaço para suas próximas ideias.</h3>
                      <p>Os projetos que você criar aparecem aqui.</p>
                      <button
                        className="text-link"
                        disabled={!!busy || recording}
                        onClick={() => {
                          setDenoiseMode('general');
                          setAutomatic(false);
                          void upload(makeDemo(), 'denoise');
                        }}
                      >
                        Experimentar com um áudio de teste <ArrowRight size={14} />
                      </button>
                      <small>Sinal musical sintetizado, com ruído adicionado.</small>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {/* A Z, a IA da Absolute ZRO, tem tela própria (/studio/z, nunca a entrada) e ocupa a tela toda. */}
          {view === 'z' && zroIa && <ZroIaPanel theme={theme} />}
          {(view === 'home' || view === 'ai') && (
            <AssistantHome
              onOpen={() => setAssistant(true)}
              onUpload={() => fileInput.current?.click()}
              onDrop={(file) => {
                if (!busy && !recording) void upload(file, undefined, true);
              }}
              fileName={project?.originalName}
              disabled={!!busy || recording}
              context={
                version
                  ? {
                      ...version.metrics,
                      duration: version.info.duration,
                      channels: version.info.channels,
                    }
                  : undefined
              }
              onPlan={(next, amount, eq) => {
                if (typeof amount === 'number') setIntensity(amount);
                if (eq) selectEq(eq);
                chooseTool(next);
              }}
            />
          )}
          {view === 'plans' && (
            <PlanPage account={account} usage={usage} onUsage={() => void refreshUsage()} />
          )}
          {view === 'account' && (
            <AccountSettings account={account} usage={usage} theme={theme} onTheme={changeTheme} />
          )}

          {view === 'projects' && (
            <>
              <div className="studio-welcome">
                <div>
                  <span className="eyebrow">CADA IDEIA TEM SEU LUGAR</span>
                  <h1>
                    Meus <span className="text-gradient">projetos.</span>
                  </h1>
                  <p>
                    {projects.length} {projects.length === 1 ? 'projeto salvo' : 'projetos salvos'}{' '}
                    neste navegador.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => fileInput.current?.click()}
                  disabled={!!busy || recording}
                >
                  <Plus size={16} /> Novo projeto
                </button>
              </div>
              <label className="search-input">
                <Search size={18} />
                <input
                  placeholder="Buscar um projeto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Buscar projetos"
                />
              </label>
              <section className="project-list">
                {filtered.length ? (
                  filtered.map(renderProject)
                ) : (
                  <div className="empty-projects">
                    <Folder size={30} />
                    <h3>
                      {search
                        ? 'Nenhum projeto encontrado.'
                        : 'Seu próximo projeto começa com um arquivo.'}
                    </h3>
                    <p>
                      {search
                        ? 'Tente buscar por outro nome.'
                        : 'Importe um áudio para criar seu primeiro projeto.'}
                    </p>
                  </div>
                )}
              </section>
              <p className="storage-note">
                <ShieldCheck size={14} /> Os arquivos ficam neste dispositivo. Exporte seus áudios
                antes de limpar os dados do navegador.
              </p>
            </>
          )}
          {view === 'editor' && project && version && (
            <>
              <div className="editor-heading">
                <div>
                  <button
                    className="text-link"
                    onClick={() => navigate('projects')}
                    disabled={!!busy}
                  >
                    <ArrowLeft size={14} /> Meus projetos
                  </button>
                  <div className="editor-title-line">
                    <h1>{routeTool ? selectedTool.label : project.name}</h1>
                    <button
                      className="icon-button"
                      onClick={() => {
                        setNewName(project.name);
                        setRenaming(true);
                      }}
                      aria-label="Renomear projeto"
                      disabled={!!busy}
                    >
                      <PenLine size={16} />
                    </button>
                  </div>
                  <p>
                    <strong>{project.name}</strong> <span>·</span>
                    {formatTime(version.info.duration)} <span>·</span>{' '}
                    {version.info.channels === 1 ? 'Mono' : 'Estéreo'} <span>·</span>{' '}
                    {version.info.sampleRate / 1000} kHz <span>·</span>{' '}
                    {cloudOutput ? 'WAV float32' : 'WAV 16-bit'}{' '}
                    <span className="saved">
                      <Check size={12} /> Salvo neste navegador
                    </span>
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() => exportAudio('wav')}
                >
                  <Download size={16} /> Baixar WAV
                </button>
              </div>
              <div className="effect-toolbar" role="group" aria-label="Histórico de tratamentos">
                <button
                  className="button secondary small"
                  disabled={!!busy || previousIndex(project, versionIndex) < 0}
                  onClick={() => void selectVersion(previousIndex(project, versionIndex), 'undo')}
                >
                  <Undo2 size={15} /> Desfazer efeito
                </button>
                <button
                  className="button secondary small"
                  disabled={!!busy || nextIndex(project, versionIndex) < 0}
                  onClick={() => void selectVersion(nextIndex(project, versionIndex), 'redo')}
                >
                  Refazer efeito <ArrowRight size={15} />
                </button>
                <button
                  className="text-link"
                  disabled={!!busy || versionIndex === 0}
                  onClick={() => void selectVersion(0)}
                >
                  Restaurar original
                </button>
                <span>{versionIndex === 0 ? 'Original ativo' : version.label}</span>
              </div>
              <div className="editor-layout">
                <div className="editor-main">
                  <WavePlayer
                    key={project.id}
                    original={project.versions[0]}
                    version={version}
                    region={region}
                    onRegion={setRegion}
                    previewOnly={cloudOperation}
                  />
                  {versionIndex > 0 &&
                    project.versions.some((v) => v.processing?.cloudRestoration) && (
                      <section
                        className="finish-panel"
                        aria-label="Acabamento depois da restauração"
                      >
                        <span className="eyebrow">A VOZ RESTAURADA É SEU PONTO DE PARTIDA</span>
                        <h2>Agora, deixe do seu jeito.</h2>
                        <p>
                          Escolha um acabamento para a versão que está ouvindo. Os controles abrem
                          ao lado; no celular, logo abaixo. Cada aplicação cria uma versão que você
                          pode desfazer.
                        </p>
                        <div className="finish-options">
                          <button
                            disabled={!!busy}
                            onClick={() => {
                              selectMaster(studioVoice.id);
                              chooseTool('master');
                              setTimeout(
                                () =>
                                  document
                                    .querySelector('.treatment-panel')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                120,
                              );
                            }}
                          >
                            <Mic size={22} />
                            <strong>Voz de estúdio</strong>
                            <span>Voz próxima e clara, volume de podcast (−16 LUFS).</span>
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() => {
                              selectMaster('broadcast');
                              chooseTool('master');
                              setTimeout(
                                () =>
                                  document
                                    .querySelector('.treatment-panel')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                120,
                              );
                            }}
                          >
                            <Activity size={22} />
                            <strong>Encorpar · Premiere</strong>
                            <span>Seu multibanda + limite −3 dB. Ajuste cada banda.</span>
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() => {
                              selectEq('warm');
                              chooseTool('eq');
                              setTimeout(
                                () =>
                                  document
                                    .querySelector('.treatment-panel')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                120,
                              );
                            }}
                          >
                            <SlidersHorizontal size={22} />
                            <strong>Corpo e calor</strong>
                            <span>Um ponto de partida editável para uma voz mais encorpada.</span>
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() => {
                              selectEq('neutral');
                              chooseTool('eq');
                              setTimeout(
                                () =>
                                  document
                                    .querySelector('.treatment-panel')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                120,
                              );
                            }}
                          >
                            <AudioLines size={22} />
                            <strong>Equalizar do meu jeito</strong>
                            <span>Graves, médios, presença e brilho em cinco bandas.</span>
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() => {
                              selectMaster('youtube');
                              chooseTool('master');
                              setTimeout(
                                () =>
                                  document
                                    .querySelector('.treatment-panel')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                120,
                              );
                            }}
                          >
                            <ArrowUpRight size={22} />
                            <strong>Preparar para publicar</strong>
                            <span>YouTube, redes sociais, podcast e referências para TV.</span>
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() => {
                              chooseTool('effects');
                              setTimeout(
                                () =>
                                  document
                                    .querySelector('.treatment-panel')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                120,
                              );
                            }}
                          >
                            <Layers size={22} />
                            <strong>Explorar efeitos</strong>
                            <span>Capela, igreja, rádio, telefone e intensidade ajustável.</span>
                          </button>
                        </div>
                        <small>
                          Gostou da restauração como está? Você já pode exportar, sem aplicar outro
                          efeito.
                        </small>
                      </section>
                    )}
                  <section className="analysis-panel">
                    <div className="subheading">
                      <h2>Seu som, em detalhes.</h2>
                      <button className="text-link" onClick={report}>
                        Relatório <Download size={13} />
                      </button>
                    </div>
                    <div className="metrics-grid">
                      <div>
                        <span>
                          Volume percebido <Info size={12} />
                        </span>
                        <strong>
                          {metric(version.metrics.lufs)}
                          <small>LUFS</small>
                        </strong>
                        <p>Volume integrado do arquivo.</p>
                      </div>
                      <div>
                        <span>
                          Pico real <Info size={12} />
                        </span>
                        <strong>
                          {metric(version.metrics.truePeak)}
                          <small>dBTP</small>
                        </strong>
                        <p>Inclui picos entre amostras.</p>
                      </div>
                      <div>
                        <span>Faixa de loudness</span>
                        <strong>
                          {metric(version.metrics.lra)}
                          <small>LU</small>
                        </strong>
                        <p>Variação do volume percebido.</p>
                      </div>
                    </div>
                    <div className={`analysis-verdict ${version.info.clipped ? 'warning' : ''}`}>
                      <ShieldCheck size={17} />
                      <p>
                        {version.info.clipped
                          ? `${version.info.clipped} amostras próximas ao limite digital. Revise os picos antes de entregar.`
                          : version.metrics.lufs === null
                            ? 'Áudio silencioso ou insuficiente para medir loudness.'
                            : 'Nenhuma amostra no limite digital de 0 dBFS. Isso não exclui distorção já presente na gravação; confira também o true peak.'}
                      </p>
                    </div>
                    {operation === 'master' &&
                      version.operation === 'master' &&
                      version.processing?.masterPreset !== 'broadcast' && (
                        <div className="delivery-result">
                          <span className="eyebrow">COMPARAÇÃO COM O ALVO ATUAL</span>
                          <p>
                            {version.metrics.lufs !== null &&
                            version.metrics.truePeak !== null &&
                            Math.abs(version.metrics.lufs - target) <= 1 &&
                            version.metrics.truePeak <= peak + 0.2
                              ? 'Dentro da referência selecionada (±1 LU / +0,2 dBTP).'
                              : 'Atenção: o resultado precisa ser revisto em relação ao alvo selecionado.'}
                          </p>
                          <small>
                            Alvo: {target} LUFS · teto {peak} dBTP. Confira as exigências do
                            destinatário.
                          </small>
                        </div>
                      )}
                  </section>
                  <section className="history-panel">
                    <div className="subheading">
                      <h2>O caminho do seu som.</h2>
                      <span>
                        {project.versions.length}{' '}
                        {project.versions.length === 1 ? 'VERSÃO' : 'VERSÕES'}
                      </span>
                    </div>
                    {project.versions.map((v, i) => (
                      <button
                        className={`version-row ${i === versionIndex ? 'active' : ''}`}
                        key={v.id}
                        disabled={!!busy}
                        onClick={() => void selectVersion(i)}
                      >
                        <span className="version-marker">
                          {i === 0 ? <ShieldCheck size={15} /> : <AudioLines size={15} />}
                        </span>
                        <span>
                          <strong>{v.label}</strong>
                          <small>
                            {i === 0
                              ? 'Original preservado'
                              : (v.preset ?? 'Tratamento não destrutivo')}{' '}
                            ·{' '}
                            {new Date(v.createdAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        </span>
                        <span>{metric(v.metrics.lufs, ' LUFS')}</span>
                        {i === versionIndex ? <Check size={15} /> : <Undo2 size={14} />}
                      </button>
                    ))}
                  </section>
                  <div className="export-strip">
                    <FileAudio size={19} />
                    <div>
                      <strong>Pronto para seguir com seu som?</strong>
                      <span>
                        {cloudOutput
                          ? `WAV 32-bit float · ${cloudRate === 48000 ? '48' : '44,1'} kHz · MP3 disponível`
                          : 'WAV 16-bit ou MP3 320 kbps · 48 kHz'}
                      </span>
                    </div>
                    <button
                      className="button secondary small"
                      onClick={() => download(project.originalFile, project.originalName)}
                      disabled={!!busy}
                    >
                      Original
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() => exportAudio('mp3')}
                      disabled={!!busy}
                    >
                      <Download size={14} /> MP3
                    </button>
                    <button
                      className={`button ${project.hasVideo ? 'secondary' : 'primary'} small`}
                      onClick={() => exportAudio('wav')}
                      disabled={!!busy}
                    >
                      <Download size={14} /> WAV
                    </button>
                    {project.hasVideo && (
                      <button
                        className="button primary small"
                        onClick={() => void exportVideo()}
                        disabled={!!busy || versionIndex === 0}
                        title={
                          versionIndex === 0
                            ? 'Trate o áudio para baixar o vídeo com o som novo.'
                            : 'O vídeo original, com o som desta versão.'
                        }
                      >
                        <Download size={14} /> Vídeo
                      </button>
                    )}
                  </div>
                </div>
                <aside className="treatment-panel">
                  <div className="panel-heading">
                    <Sparkles size={18} />
                    <h2>{selectedTool.label}</h2>
                  </div>
                  <p className="panel-subtitle">{selectedTool.description}</p>
                  {speechTool && operation !== 'auto' && (
                    <div className="automatic-card">
                      <div>
                        <Sparkles size={22} />
                        <h3>{autoEnabled ? 'A IA cuida dos ajustes.' : 'Ajustes manuais'}</h3>
                      </div>
                      <p>
                        {cloudOperation || autoEnabled
                          ? 'Analisamos a gravação original e adaptamos a limpeza à sua voz, preservando o timbre e o estéreo. O volume e os picos são verificados no resultado.'
                          : 'Personalize o tratamento ou volte à análise automática.'}
                      </p>
                      <button
                        className="text-link"
                        disabled={!!busy}
                        onClick={() => setAutomatic(!automatic)}
                      >
                        {autoEnabled ? 'Ajustar manualmente' : 'Usar análise automática'}
                      </button>
                    </div>
                  )}
                  {operation === 'transcribe' && transcriptCues && project.transcript && (
                    <div className="transcript-card">
                      <div className="transcript-meta">
                        <strong>{transcriptCues.length} legendas</strong>
                        <span>
                          {project.transcript.words.length} palavras
                          {project.transcript.language
                            ? ` · ${project.transcript.language.toUpperCase()}`
                            : ''}
                        </span>
                      </div>
                      <ol className="transcript-cues" aria-label="Prévia das legendas">
                        {transcriptCues.slice(0, 60).map((cue, i) => (
                          <li key={i}>
                            <time>{formatTime(cue.start)}</time>
                            <span>{cue.text}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="transcript-actions" role="group" aria-label="Baixar legendas">
                        {(['srt', 'vtt', 'txt'] as const).map((format) => (
                          <button
                            key={format}
                            className={`button ${format === 'srt' ? 'primary' : 'secondary'} small`}
                            disabled={!!busy}
                            onClick={() => exportTranscript(format)}
                          >
                            <Download size={14} /> {format.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {operation === 'remix' && project.stems && (
                    <StemMixer
                      files={project.stems.files}
                      gainDb={project.stems.gainDb}
                      busy={!!busy}
                      onRender={(settings) => void renderRemix(settings)}
                    />
                  )}
                  {operation === 'vocals' && !pendingJob && (
                    <div
                      className="preset-grid voice-modes"
                      role="group"
                      aria-label="Tipo de áudio"
                    >
                      <button
                        className={voiceMode === 'speech' ? 'active' : ''}
                        aria-pressed={voiceMode === 'speech'}
                        disabled={!!busy}
                        onClick={() => setVoiceMode('speech')}
                      >
                        <strong>Fala</strong>
                        <span>Podcast, vídeo, entrevista.</span>
                      </button>
                      <button
                        className={voiceMode === 'singing' ? 'active' : ''}
                        aria-pressed={voiceMode === 'singing'}
                        disabled={!!busy}
                        onClick={() => setVoiceMode('singing')}
                      >
                        <strong>Música</strong>
                        <span>Só o vocal da canção, em estéreo.</span>
                      </button>
                    </div>
                  )}
                  {cloudOperation && (
                    <div className="cloud-restoration-note">
                      <strong>
                        {pendingJob
                          ? (
                              {
                                uploading: 'Envio incompleto',
                                submitting: 'Confirmando envio',
                                queued: 'Na fila',
                                running:
                                  operation === 'transcribe'
                                    ? 'Escrevendo'
                                    : operation === 'remix'
                                      ? 'Separando'
                                      : 'Restaurando',
                                completed: 'Resultado pronto',
                              } as Record<string, string>
                            )[pendingJob.status] || 'Em andamento'
                          : cloudReady === null
                            ? 'Preparando…'
                            : cloudReady
                              ? operation === 'remix'
                                ? project.stems
                                  ? 'Faixas prontas'
                                  : 'Pronto para separar os instrumentos'
                                : operation === 'transcribe'
                                  ? 'Pronto para escrever o que foi dito'
                                  : operation === 'vocals'
                                    ? voiceMode === 'speech'
                                      ? 'Pronto para isolar sua voz'
                                      : 'Pronto para separar o cantor'
                                    : 'Pronto para melhorar sua voz'
                              : 'A melhoria com IA está temporariamente indisponível'}
                      </strong>
                      {!pendingJob && (
                        <p>
                          {operation === 'vocals' && voiceMode === 'singing'
                            ? 'Uma cópia vai para a IA. Pode sobrar um pouco dos instrumentos.'
                            : operation === 'remix'
                              ? 'Uma cópia vai para a IA. Pode sobrar um pouco de um instrumento no outro.'
                              : operation === 'transcribe'
                                ? 'Uma cópia do som vai para a IA. Revise nomes antes de publicar.'
                                : 'Uma cópia vai para a IA. Seu original fica salvo.'}
                        </p>
                      )}
                      {!cloudReady && operation !== 'vocals' && (
                        <button
                          className="text-link"
                          disabled={!!busy}
                          onClick={() => chooseTool('denoise')}
                        >
                          Experimentar outra limpeza <ArrowRight size={15} />
                        </button>
                      )}
                      {pendingJob && (
                        <div className="cloud-pending">
                          {(pendingJob.createdAt || pendingJob.duration) && (
                            <p className="cloud-pending-meta">
                              {[
                                pendingJob.createdAt &&
                                  new Date(pendingJob.createdAt).toLocaleString('pt-BR', {
                                    timeZone: 'America/Fortaleza',
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  }),
                                pendingJob.duration &&
                                  `${Math.floor(pendingJob.duration / 60)}min ${Math.round(pendingJob.duration % 60)}s`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                          {pendingJob.projectId !== project.id && (
                            <p>
                              {pendingJob.projectId
                                ? 'Este pedido é de outro projeto.'
                                : 'Pedido iniciado em outro aparelho. Recupere o original para acompanhar.'}
                            </p>
                          )}
                          {pendingJob.status === 'submitting' && (
                            <p>Ainda sem confirmação de que o tratamento começou.</p>
                          )}
                          {pendingJob.projectId && pendingJob.projectId !== project.id && (
                            <StudioLink
                              className="text-link"
                              href={toolPath(
                                presetOperation(pendingJob.preset),
                                pendingJob.projectId,
                              )}
                            >
                              Abrir áudio em andamento
                            </StudioLink>
                          )}
                          {!pendingJob.projectId && (
                            <button
                              className="button secondary"
                              disabled={!!busy || pendingJob.status === 'uploading'}
                              onClick={() => void recoverPendingAudio()}
                            >
                              Recuperar áudio deste pedido <ArrowRight size={15} />
                            </button>
                          )}
                          {!pendingJob.projectId && pendingJob.status === 'uploading' && (
                            <p>
                              Para concluir o envio, volte ao navegador onde começou. O arquivo
                              ainda não foi enviado por completo.
                            </p>
                          )}
                          {!busy && (
                            <div className="cloud-pending-actions">
                              <button
                                className="text-link"
                                onClick={async () => {
                                  try {
                                    const cancellation = await cancelCloudJob(pendingJob.id);
                                    if (cancellation.status === 'submitting')
                                      throw new Error(
                                        'O envio ainda está sem confirmação. Não foi possível confirmar o cancelamento; verifique o andamento novamente.',
                                      );
                                    const r = await fetch(`/api/audio/jobs?id=${pendingJob.id}`, {
                                      cache: 'no-store',
                                    });
                                    const data = await r.json();
                                    if (['failed', 'cancelled', 'completed'].includes(data.status))
                                      await releaseCloudJob(pendingJob.id);
                                    await refreshCloud();
                                    await refreshUsage();
                                    notify(
                                      'Cancelamento solicitado. Seu áudio original continua salvo.',
                                    );
                                  } catch (error) {
                                    setError(
                                      error instanceof Error
                                        ? error.message
                                        : 'Não foi possível confirmar o cancelamento. Tente novamente.',
                                    );
                                  }
                                }}
                              >
                                Cancelar
                              </button>
                              <button className="text-link" onClick={() => void refreshCloud()}>
                                Atualizar
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`treatment-controls ${autoEnabled ? 'automatic-controls' : ''}`}>
                    {operation === 'effects' && (
                      <>
                        <div
                          className="preset-grid effect-presets"
                          role="group"
                          aria-label="Presets de efeitos"
                        >
                          {effectPresets.map((p) => (
                            <button
                              key={p.id}
                              className={effect === p.id ? 'active' : ''}
                              aria-pressed={effect === p.id}
                              disabled={!!busy}
                              onClick={() => selectEffect(p.id)}
                            >
                              <strong>{p.label}</strong>
                              <span>{p.description}</span>
                            </button>
                          ))}
                        </div>
                        <RangeControl
                          label="Intensidade do efeito"
                          value={effectMix}
                          min={0}
                          max={100}
                          unit="%"
                          disabled={!!busy || effect === 'none'}
                          onChange={setEffectMix}
                        />
                        <p className="field-hint">
                          Trocar o efeito parte da mesma versão de origem, sem acumular
                          reverberação. A cauda é preservada na exportação.
                        </p>
                        {version.operation === 'effects' && (
                          <button
                            className="button secondary small"
                            disabled={!!busy}
                            onClick={() => {
                              const index = project.versions.findIndex(
                                (v) => v.id === version.parentId,
                              );
                              if (index >= 0) {
                                selectEffect('none');
                                void selectVersion(index);
                              }
                            }}
                          >
                            Remover efeito
                          </button>
                        )}
                      </>
                    )}
                    {operation === 'eq' && (
                      <EqualizerControls
                        gains={eqGains}
                        highpass={eqHighpass}
                        preset={eqPreset}
                        onPreset={selectEq}
                        onGains={(g) => {
                          setEqGains(g);
                          setEqPreset('custom');
                        }}
                        onHighpass={setEqHighpass}
                        disabled={!!busy}
                      />
                    )}
                    {operation === 'clarity' && (
                      <div
                        className="preset-grid voice-presets"
                        role="group"
                        aria-label="Presets de voz"
                      >
                        {voicePresets.map((p) => (
                          <button
                            key={p.id}
                            className={voicePreset === p.id ? 'active' : ''}
                            aria-pressed={voicePreset === p.id}
                            disabled={!!busy}
                            onClick={() => selectVoice(p.id)}
                          >
                            <strong>{p.label}</strong>
                            <span>{p.description}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {operation === 'master' && (
                      <>
                        <div
                          className="preset-grid master-presets"
                          role="group"
                          aria-label="Presets de masterização"
                        >
                          <button
                            className={masterRecipe === 'broadcast' ? 'active' : ''}
                            aria-pressed={masterRecipe === 'broadcast'}
                            disabled={!!busy}
                            onClick={() => selectMaster('broadcast')}
                          >
                            <strong>Transmissão + Limite −3 dB</strong>
                            <span>
                              Sua cadeia do Premiere, com quatro bandas e dois limitadores.
                            </span>
                          </button>
                          <button
                            className={masterRecipe === studioVoice.id ? 'active' : ''}
                            aria-pressed={masterRecipe === studioVoice.id}
                            disabled={!!busy}
                            onClick={() => selectMaster(studioVoice.id)}
                          >
                            <strong>{studioVoice.label}</strong>
                            <span>
                              Graves limpos, presença, de-esser leve e {studioVoice.lufs} LUFS ·{' '}
                              {studioVoice.peak} dBTP
                            </span>
                          </button>
                          {deliveryPresets.map((p) => (
                            <button
                              key={p.id}
                              disabled={!!busy}
                              className={masterRecipe === p.id ? 'active' : ''}
                              aria-pressed={masterRecipe === p.id}
                              onClick={() => selectMaster(p.id)}
                            >
                              <strong>{p.label}</strong>
                              <span>
                                {p.lufs} LUFS · {p.peak} dBTP
                              </span>
                            </button>
                          ))}
                        </div>
                        {masterRecipe === 'broadcast' && (
                          <BroadcastControls
                            settings={broadcast}
                            onChange={setBroadcast}
                            disabled={!!busy}
                          />
                        )}
                      </>
                    )}

                    {(operation === 'denoise' || operation === 'clarity') && (
                      <>
                        <span className="field-label">MODO DE LIMPEZA</span>
                        <div
                          className="audio-mode-options"
                          role="group"
                          aria-label="Modo de limpeza"
                        >
                          <button
                            aria-pressed={denoiseMode === 'studio'}
                            className={denoiseMode === 'studio' ? 'active' : ''}
                            disabled={!!busy}
                            onClick={() => setDenoiseMode('studio')}
                          >
                            <Sparkles size={18} />
                            <strong>NOSSOM Voice</strong>
                            <span>DeepFilterNet3 · qualidade</span>
                          </button>
                          <button
                            aria-pressed={denoiseMode === 'voice'}
                            className={denoiseMode === 'voice' ? 'active' : ''}
                            disabled={!!busy}
                            onClick={() => setDenoiseMode('voice')}
                          >
                            <Mic size={18} />
                            <strong>Voz · IA local</strong>
                            <span>Modelo neural para fala</span>
                          </button>
                          <button
                            aria-pressed={denoiseMode === 'general'}
                            className={denoiseMode === 'general' ? 'active' : ''}
                            disabled={!!busy}
                            onClick={() => setDenoiseMode('general')}
                          >
                            <AudioLines size={18} />
                            <strong>Áudio geral</strong>
                            <span>Redução espectral</span>
                          </button>
                        </div>
                        <p className="field-hint">
                          {denoiseMode === 'studio'
                            ? 'Restauração neural em banda completa, a 48 kHz. Modelo DeepFilterNet3 executado localmente. O primeiro uso baixa cerca de 33 MB.'
                            : denoiseMode === 'voice'
                              ? 'O modelo RNNoise distingue fala de ruído. Para música e instrumentos, use Áudio geral.'
                              : 'Atenua ruído contínuo preservando conteúdo musical. Ajuste o piso para o seu ambiente.'}
                        </p>
                      </>
                    )}
                    {denoiseMode === 'studio' &&
                      (operation === 'denoise' || operation === 'clarity') && (
                        <RangeControl
                          label="Supressão neural máxima"
                          value={neuralAttenuation}
                          min={0}
                          max={80}
                          unit=" dB"
                          disabled={!!busy}
                          onChange={setNeuralAttenuation}
                        />
                      )}
                    {operation !== 'effects' && !cloudOperation && (
                      <>
                        <RangeControl
                          label={
                            operation === 'master'
                              ? masterRecipe === 'broadcast'
                                ? 'Mistura do preset'
                                : 'Controle de dinâmica'
                              : operation === 'mix'
                                ? 'Redução da trilha durante a fala'
                                : 'Intensidade do tratamento'
                          }
                          value={intensity}
                          min={0}
                          max={100}
                          unit="%"
                          disabled={!!busy}
                          onChange={setIntensity}
                        />
                        <div
                          className="intensity-selector"
                          role="group"
                          aria-label="Atalhos de intensidade"
                        >
                          {[
                            [30, 'Suave'],
                            [65, 'Equilibrado'],
                            [100, 'Máximo'],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              disabled={!!busy}
                              className={intensity === value ? 'active' : ''}
                              onClick={() => setIntensity(Number(value))}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="field-hint">
                          {operation === 'master'
                            ? masterRecipe === 'broadcast'
                              ? 'Mistura o sinal original com a cadeia de transmissão. Em 100%, utiliza somente o resultado tratado.'
                              : 'Controla a faixa dinâmica pedida ao normalizador. Confira o resultado nas medições abaixo.'
                            : operation === 'mix'
                              ? 'Quanto maior, mais a trilha recua enquanto há sinal na voz.'
                              : intensity === 0
                                ? 'Sem tratamento adicional.'
                                : intensity > 85
                                  ? 'Tratamento intenso. Compare com o original para conferir se os detalhes continuam naturais.'
                                  : 'Ajuste livremente, aplique e compare o resultado com o original.'}
                        </p>
                      </>
                    )}
                    {['denoise', 'clarity', 'wind'].includes(operation) &&
                      (denoiseMode === 'general' || operation === 'wind') && (
                        <>
                          <RangeControl
                            label="Redução máxima de ruído"
                            value={noiseReduction}
                            min={0}
                            max={48}
                            unit=" dB"
                            disabled={!!busy}
                            onChange={setNoiseReduction}
                          />
                          <RangeControl
                            label="Piso de ruído"
                            value={noiseFloor ?? version.info.noiseFloor ?? -50}
                            min={-80}
                            max={-20}
                            unit=" dB"
                            disabled={!!busy}
                            onChange={setNoiseFloor}
                          />
                          <button
                            className="text-link analyze-noise"
                            disabled={!!busy}
                            onClick={() =>
                              void run(async () => {
                                setBusy('Analisando os trechos mais silenciosos…');
                                const buffer = await decode(version.blob);
                                const profile = estimateNoiseFloor(
                                  buffer.getChannelData(0),
                                  buffer.sampleRate,
                                );
                                setNoiseFloor(profile.floorDb);
                                setAnalysisNote(
                                  profile.confidence === 'estimated'
                                    ? `Piso estimado: ${profile.floorDb} dB. Ajuste pela escuta antes de aplicar.`
                                    : 'Não encontrei uma pausa clara para estimar o ruído. Mantive −50 dB como ponto de partida.',
                                );
                              })
                            }
                          >
                            <Activity size={14} /> Estimar pelo áudio
                          </button>
                          {analysisNote && (
                            <p className="field-hint" role="status">
                              {analysisNote}
                            </p>
                          )}
                        </>
                      )}
                    {operation === 'clarity' && (
                      <>
                        <RangeControl
                          label="Controle de sibilância"
                          value={deess}
                          min={0}
                          max={100}
                          unit="%"
                          disabled={!!busy}
                          onChange={setDeess}
                        />
                        <label className="field-label" htmlFor="hum-mode">
                          HUM DE REDE
                        </label>
                        <select
                          id="hum-mode"
                          value={hum}
                          disabled={!!busy}
                          onChange={(e) => setHum(Number(e.target.value))}
                        >
                          <option value={0}>Desligado</option>
                          <option value={50}>50 Hz + harmônicos</option>
                          <option value={60}>60 Hz + harmônicos</option>
                        </select>
                      </>
                    )}
                    {operation === 'clarity' && (
                      <RangeControl
                        label="Presença da voz"
                        value={presence}
                        min={0}
                        max={9}
                        step={0.5}
                        unit=" dB"
                        disabled={!!busy}
                        onChange={setPresence}
                      />
                    )}
                    {(operation === 'clarity' || operation === 'level') && (
                      <RangeControl
                        label="Compressão"
                        value={compression}
                        min={1}
                        max={8}
                        step={0.5}
                        unit=":1"
                        disabled={!!busy}
                        onChange={setCompression}
                      />
                    )}
                    {operation === 'wind' && (
                      <RangeControl
                        label="Corte de graves"
                        value={highpass}
                        min={30}
                        max={300}
                        step={5}
                        unit=" Hz"
                        disabled={!!busy}
                        onChange={setHighpass}
                      />
                    )}
                  </div>
                  {operation === 'master' && masterRecipe !== 'broadcast' && (
                    <>
                      <label className="field-label" htmlFor="destination">
                        ONDE ESSE SOM VAI CHEGAR?
                      </label>
                      <select
                        id="destination"
                        value={preset}
                        disabled={!!busy}
                        onChange={(e) => {
                          setMasterRecipe(e.target.value);
                          const p = deliveryPresets.find((p) => p.id === e.target.value)!;
                          setPreset(p.id);
                          setTarget(p.lufs);
                          setPeak(p.peak);
                        }}
                      >
                        {deliveryPresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <p className="field-hint">
                        {deliveryPresets.find((p) => p.id === preset)?.note}
                      </p>
                      <RangeControl
                        label="Volume final"
                        value={target}
                        min={-30}
                        max={-10}
                        step={0.5}
                        unit=" LUFS"
                        disabled={!!busy}
                        onChange={setTarget}
                      />
                      <RangeControl
                        label="Teto de pico"
                        value={peak}
                        min={-6}
                        max={-1}
                        step={0.1}
                        unit=" dBTP"
                        disabled={!!busy}
                        onChange={setPeak}
                      />
                      <div className="target-preview">
                        <span>
                          Atual
                          <strong>
                            {metric(version.metrics.lufs)} <small>LUFS</small>
                          </strong>
                        </span>
                        <ArrowRight size={16} />
                        <span>
                          Alvo
                          <strong>
                            {target} <small>LUFS</small>
                          </strong>
                        </span>
                      </div>
                    </>
                  )}
                  {operation === 'mix' && (
                    <>
                      <label className="field-label">SUA TRILHA</label>
                      <button
                        className="music-upload"
                        onClick={() => musicInput.current?.click()}
                        disabled={!!busy}
                      >
                        <Plus size={19} />
                        <span>{music?.name ?? 'Adicionar faixa de música'}</span>
                      </button>
                      <label className="field-label" htmlFor="music-volume">
                        NÍVEL DA TRILHA · {Math.round(musicGain * 100)}%
                      </label>
                      <input
                        id="music-volume"
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={musicGain}
                        onChange={(e) => setMusicGain(Number(e.target.value))}
                        disabled={!!busy}
                      />
                      <p className="field-hint">
                        A trilha se repete até o fim do áudio e abaixa automaticamente quando há
                        sinal na faixa principal.
                      </p>
                    </>
                  )}
                  {!autoEnabled && !cloudOperation && (
                    <>
                      <PresetLibrary
                        operation={operation}
                        owner={account.id}
                        disabled={!!busy}
                        onLoad={loadSavedPreset}
                        current={{
                          operation,
                          intensity,
                          mode: denoiseMode,
                          target,
                          peak,
                          musicGain,
                          settings: {
                            automatic: false,
                            noiseFloor: noiseFloor ?? version.info.noiseFloor,
                            noiseReduction,
                            neuralAttenuation,
                            presence,
                            compression,
                            highpass: operation === 'eq' ? eqHighpass : highpass,
                            eq: operation === 'eq' ? eqGains : undefined,
                            masterPreset: operation === 'master' ? masterRecipe : undefined,
                            broadcast:
                              operation === 'master' && masterRecipe === 'broadcast'
                                ? broadcast
                                : undefined,
                            deess: operation === 'clarity' ? deess : undefined,
                            hum: operation === 'clarity' ? hum : undefined,
                            effect: operation === 'effects' ? effect : undefined,
                            effectMix: operation === 'effects' ? effectMix : undefined,
                          },
                        }}
                      />
                      <button
                        className="advanced-toggle"
                        onClick={() => setAdvanced(!advanced)}
                        aria-expanded={advanced}
                      >
                        <Settings2 size={14} /> Detalhes avançados <Plus size={13} />
                      </button>
                      {advanced && (
                        <div className="advanced-panel">
                          {operation === 'master' ? (
                            <>
                              <label>
                                Loudness alvo (LUFS)
                                <input
                                  type="number"
                                  min={-30}
                                  max={-10}
                                  value={target}
                                  disabled={!!busy}
                                  onChange={(e) =>
                                    setTarget(Math.max(-30, Math.min(-10, Number(e.target.value))))
                                  }
                                />
                              </label>
                              <label>
                                Teto de true peak (dBTP)
                                <input
                                  type="number"
                                  min={-6}
                                  max={-1}
                                  step={0.1}
                                  value={peak}
                                  disabled={!!busy}
                                  onChange={(e) =>
                                    setPeak(Math.max(-6, Math.min(-1, Number(e.target.value))))
                                  }
                                />
                              </label>
                              <p>
                                Normalização EBU R128 por FFmpeg loudnorm, com medição
                                pós-renderização. Perfis de cinema e ATSC exigem especificações
                                próprias.
                              </p>
                            </>
                          ) : (
                            <p>
                              {operation === 'denoise'
                                ? 'RNNoise neural para fala ou afftdn espectral adaptativo. Intensidade contínua, alinhamento temporal preservado e processamento local.'
                                : operation === 'clarity'
                                  ? 'Limpeza neural ou espectral, corte em 70 Hz, redução de graves médios, presença em 3 kHz, compressor e limitador.'
                                  : operation === 'wind'
                                    ? 'Corte de graves ajustável de 30 a 300 Hz com redução espectral de ruído.'
                                    : operation === 'level'
                                      ? 'Compressor: threshold 0,12; ratio 2 / 3 / 4; ataque 10 ms; release 220 ms. Limiter de pico amostral em −1 dBFS.'
                                      : 'Sidechain compressor: threshold 0,02; ratio 6:1; ataque 20 ms; release 500 ms. Não usa detecção semântica de fala.'}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {operation !== 'auto' &&
                    autoEnabled &&
                    version.processing?.restoration?.automatic && (
                      <div className="automatic-result" role="status">
                        <Check size={17} />{' '}
                        <span>
                          Análise concluída · limpeza adaptada, estéreo preservado e picos
                          verificados.
                          <small>
                            Supressão escolhida: {version.processing.restoration.attenuationDb} dB.
                            Os ajustes usados estão no relatório.
                          </small>
                          {version.processing.clippingRepair && (
                            <small>
                              {version.processing.clippingRepair.status === 'reconstructed'
                                ? 'Picos saturados identificados e reconstruídos. Compare os trechos distorcidos com o original.'
                                : version.processing.clippingRepair.status === 'limited'
                                  ? 'Saturação extensa: a restauração local não reconstrói esta gravação com segurança. A distorção pode permanecer.'
                                  : 'Sem teto de saturação identificável. Distorção de captação ou de compressão ainda pode estar presente.'}
                            </small>
                          )}
                        </span>
                      </div>
                    )}
                  <button
                    className="button primary process-button"
                    onClick={applyTreatment}
                    disabled={
                      !!busy ||
                      (cloudOperation && !cloudReady) ||
                      (cloudOperation &&
                        usage !== null &&
                        !usage.unlimited &&
                        usage.remaining === 0 &&
                        !pendingJob)
                    }
                  >
                    {busy ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{' '}
                    {busy
                      ? 'Processando…'
                      : cloudOperation && usage && !usage.unlimited && usage.remaining === 0
                        ? 'Franquia mensal utilizada'
                        : cloudOperation
                          ? pendingJob?.projectId === project.id
                            ? operation === 'vocals'
                              ? 'Retomar separação'
                              : operation === 'transcribe' || operation === 'remix'
                                ? operation === 'remix'
                                  ? 'Retomar separação'
                                  : 'Retomar legendas'
                                : 'Retomar restauração'
                            : operation === 'remix'
                              ? project.stems
                                ? 'Separar de novo'
                                : 'Separar instrumentos'
                              : operation === 'transcribe'
                                ? project.transcript
                                  ? 'Gerar de novo'
                                  : 'Gerar legendas'
                                : operation === 'vocals'
                                  ? voiceMode === 'speech'
                                    ? 'Isolar voz'
                                    : 'Separar vocal'
                                  : 'Restaurar com IA'
                          : autoEnabled
                            ? 'Analisar e tratar'
                            : 'Aplicar tratamento'}{' '}
                    {!busy && <ArrowRight size={15} />}
                  </button>
                  {!usage?.unlimited && (
                    <p className="usage-apply-hint">Usa seus minutos de IA (mínimo 1 min).</p>
                  )}
                  {!cloudOperation && (
                    <span className="treatment-footnote">
                      <ShieldCheck size={12} />{' '}
                      {autoEnabled
                        ? 'Sempre a partir do original. Suas versões continuam salvas.'
                        : 'Uma nova versão. Seu original intacto.'}
                    </span>
                  )}
                  <div className="panel-help">
                    <AudioLines size={21} />
                    <h3>Não sabe por onde começar?</h3>
                    <p>Descreva a sua ideia e encontre um tratamento.</p>
                    <button className="text-link" onClick={() => setAssistant(true)}>
                      Conversar com o assistente <ArrowUpRight size={13} />
                    </button>
                  </div>
                </aside>
              </div>
            </>
          )}
        </main>
        <footer className="studio-footer">
          <span>
            NOSSOM <span>·</span> Tudo acontece no som.
          </span>
          <span>
            <ShieldCheck size={12} /> IA na nuvem · acabamento no dispositivo
          </span>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button className="icon-button" aria-label="Fechar aviso" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
      <nav className="studio-tabs" aria-label="Navegação rápida" inert={mobile && sidebar}>
        <button
          className={view === 'home' || view === 'ai' ? 'active' : ''}
          onClick={() => navigate('home')}
        >
          <House size={19} />
          <span>Início</span>
        </button>
        <button
          className={view === 'projects' ? 'active' : ''}
          onClick={() => navigate('projects')}
          title={pending.projects.title || undefined}
        >
          <Folder size={19} />
          <span>Projetos</span>
          <NavBadge count={pending.projects.count} corner />
        </button>
        <button
          className={routeTool ? 'active' : ''}
          disabled={!!busy || recording}
          onClick={() => chooseTool(operation)}
        >
          <AudioLines size={19} />
          <span>Estúdio</span>
        </button>
        <button
          className={view === 'account' ? 'active' : ''}
          disabled={!!busy || recording}
          onClick={() => visitStudio('/studio/conta')}
        >
          <MessageCircle size={19} />
          <span>Conta</span>
        </button>
        {setZro.visivel && (
          <button
            className={setZro.aberto ? 'active' : ''}
            aria-haspopup="dialog"
            aria-expanded={setZro.aberto}
            aria-label={rotuloSet(setZro)}
            data-set=""
            onClick={setZro.alternar}
          >
            <UsersRound size={19} />
            <span>Set</span>
            <NavBadge count={setZro.novidades} corner />
          </button>
        )}
      </nav>
      {assistant && (
        <Assistant
          onClose={() => setAssistant(false)}
          onPlan={(next, amount, eq) => {
            if (typeof amount === 'number') setIntensity(amount);
            if (eq) selectEq(eq);
            chooseTool(next);
          }}
          context={
            version
              ? {
                  ...version.metrics,
                  duration: version.info.duration,
                  channels: version.info.channels,
                }
              : undefined
          }
        />
      )}{' '}
      {upgradeOffer && usage && (
        <UpgradeOffer
          usage={usage}
          reason={upgradeOffer}
          onClose={() => setUpgradeOffer(null)}
          onChoose={(plan) => {
            setUpgradeOffer(null);
            visitStudio('/studio/planos?plano=' + plan);
          }}
        />
      )}
      {deleteId && (
        <div className="modal-backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <Trash2 size={27} />
            <h2 id="delete-title">Excluir este projeto?</h2>
            <p>
              O áudio e todas as versões serão removidos deste navegador. Exporte os arquivos que
              deseja guardar antes de continuar.
            </p>
            <div>
              <button className="button secondary" onClick={() => setDeleteId(null)}>
                Manter projeto
              </button>
              <button className="button danger" onClick={remove}>
                Excluir projeto
              </button>
            </div>
          </section>
        </div>
      )}
      {renaming && (
        <div className="modal-backdrop">
          <form
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-title"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <h2 id="rename-title">Um nome para essa ideia.</h2>
            <input
              aria-label="Nome do projeto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
            <div>
              <button type="button" className="button secondary" onClick={() => setRenaming(false)}>
                Cancelar
              </button>
              <button className="button primary" type="submit">
                Salvar nome
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
