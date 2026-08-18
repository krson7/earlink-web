"use client";

import SignLanguageCamera from "@/components/SignLanguageCamera";

type CameraComposerProps = {
  roomCode: string;
  participantId: number;
  chatConnected: boolean;
  chatErrorMessage: string;
  onSendText: (text: string) => boolean;
};

export default function CameraComposer({
  roomCode,
  participantId,
  chatConnected,
  chatErrorMessage,
  onSendText,
}: CameraComposerProps) {
  return (
    <section className="shrink-0 border-t border-slate-200 bg-white shadow-[0_-10px_30px_rgba(15,23,42,0.08)]">
      <SignLanguageCamera
        roomCode={roomCode}
        participantId={participantId}
        chatConnected={chatConnected}
        chatErrorMessage={chatErrorMessage}
        onSendText={onSendText}
      />
    </section>
  );
}