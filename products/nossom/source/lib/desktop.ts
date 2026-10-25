export type UpdateState = {
  status:
    | 'unavailable'
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error';
  version: string;
  nextVersion?: string;
  progress: number;
  error?: string;
  installRequested?: boolean;
  automatic?: boolean;
};
export type DesktopBridge = {
  getUpdateState: () => Promise<UpdateState>;
  update: (action: 'check' | 'download' | 'install') => Promise<UpdateState>;
  onUpdate: (listener: (state: UpdateState) => void) => () => void;
};
declare global {
  interface Window {
    nossomDesktop?: DesktopBridge;
  }
}
