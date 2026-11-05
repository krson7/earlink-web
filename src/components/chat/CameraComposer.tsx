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
    <section className="camera-composer">
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