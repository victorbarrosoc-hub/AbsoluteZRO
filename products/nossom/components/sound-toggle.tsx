'use client';
import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { setUiSound, uiSoundEnabled } from '@/lib/ui-sound';
export default function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(uiSoundEnabled()), []);
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={on}
      onClick={() => {
        setUiSound(!on);
        setOn(!on);
      }}
    >
      {on ? <Volume2 size={14} /> : <VolumeX size={14} />}
      Sons da interface
    </button>
  );
}
