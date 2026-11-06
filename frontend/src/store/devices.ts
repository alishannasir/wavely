import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DevicesState {
  videoDeviceId: string | null;
  audioDeviceId: string | null;
  setVideoDeviceId: (id: string | null) => void;
  setAudioDeviceId: (id: string | null) => void;
}

/** Camera/microphone picked on the preview screen; used when the call connects. */
export const useDevices = create<DevicesState>()(
  persist(
    (set) => ({
      videoDeviceId: null,
      audioDeviceId: null,
      setVideoDeviceId: (videoDeviceId) => set({ videoDeviceId }),
      setAudioDeviceId: (audioDeviceId) => set({ audioDeviceId }),
    }),
    { name: 'ovc-devices' },
  ),
);
