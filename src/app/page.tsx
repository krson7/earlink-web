"use client";

import { useEffect, useState } from "react";

import ChatScreen from "@/components/chat/ChatScreen";
import IntroSplash from "@/components/entry/IntroSplash";
import ModeSelectScreen from "@/components/entry/ModeSelectScreen";
import MobileAppShell from "@/components/layout/MobileAppShell";
import { useChatSocket } from "@/hooks/useChatSocket";
import { useRoomSession } from "@/hooks/useRoomSession";
import type { AccessibilityMode } from "@/types/chat";

const SPLASH_DURATION_MS = 1800;

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);

  const room = useRoomSession();
  const chat = useChatSocket(room.participant);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  function handleSelectMode(selectedMode: AccessibilityMode): void {
    chat.clearError();

    void room.enterRoom(
      selectedMode,
      chat.prepareConnection,
    );
  }

  function handleLeaveRoom(): void {
    chat.reset();
    room.leaveRoom();
  }

  return (
    <MobileAppShell>
      {showSplash ? (
        <IntroSplash />
      ) : room.participant ? (
        <ChatScreen
          participant={room.participant}
          messages={chat.messages}
          chatConnected={chat.connected}
          chatStatus={chat.status}
          chatErrorMessage={chat.errorMessage}
          onLeave={handleLeaveRoom}
          onSendMessage={chat.sendMessage}
          onClearError={chat.clearError}
        />
      ) : (
        <ModeSelectScreen
          loading={room.joining}
          errorMessage={room.joinError}
          onSelectMode={handleSelectMode}
        />
      )}
    </MobileAppShell>
  );
}