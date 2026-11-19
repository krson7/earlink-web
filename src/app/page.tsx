"use client";

import { useCallback, useEffect, useState } from "react";

import ChatScreen from "@/components/chat/ChatScreen";
import DeviceConnectSheet from "@/components/device/DeviceConnectSheet";
import IntroSplash from "@/components/entry/IntroSplash";
import ModeSelectScreen from "@/components/entry/ModeSelectScreen";
import MobileAppShell from "@/components/layout/MobileAppShell";
import { useChatSocket } from "@/hooks/useChatSocket";
import { useBrailleTyping } from "@/hooks/useBrailleTyping";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { useEarLinkBluetooth } from "@/hooks/useEarLinkBluetooth";
import { useRoomSession } from "@/hooks/useRoomSession";
import type { AccessibilityMode } from "@/types/chat";

const SPLASH_DURATION_MS = 1800;

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(false);

  const room = useRoomSession();
  const chat = useChatSocket(room.participant);

  /*
   * 점자 기기 연결은 화면 전환과 무관하게 여기서 유지한다.
   * 메인 화면에서 먼저 연결하고, 어떤 대화 방식으로 들어가도
   * 같은 연결로 점자를 전달하고 점자 키보드 입력을 받는다.
   */
  const earLink = useEarLinkBluetooth({
    ready: Boolean(room.participant) && chat.connected,
    onSend: chat.sendBrailleMessage,
  });
  const { supported, connected, connecting, connect } = earLink;

  const brailleDraft = useBrailleTyping({
    enabled: connected && earLink.keyboardSupported && chat.connected,
    snapshot: connected && earLink.keyboardSupported ? earLink.keyboard : null,
    publish: chat.sendBrailleTyping,
  });

  // 다른 휴대폰이 이미 기기에 연결했는지 서버로 공유한다.
  const presence = useDevicePresence({
    localConnected: connected,
    serialNumber: earLink.serialNumber,
    poll: true,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  /*
   * 기기 선택 창(requestDevice)은 사용자의 클릭 안에서만 열 수 있으므로
   * 팝업을 여는 같은 클릭에서 바로 연결을 시작한다.
   */
  const handleDevicePress = useCallback((): void => {
    setGuideDismissed(true);
    setSheetOpen(true);

    if (supported && !connected && !connecting && !presence.remoteConnected) {
      void connect();
    }
  }, [supported, connected, connecting, connect, presence.remoteConnected]);

  const handleConnect = useCallback((): void => {
    void connect();
  }, [connect]);

  const closeSheet = useCallback((): void => {
    setSheetOpen(false);
  }, []);

  const dismissGuide = useCallback((): void => {
    setGuideDismissed(true);
  }, []);

  function handleSelectMode(selectedMode: AccessibilityMode): void {
    chat.clearError();
    setGuideDismissed(true);

    void room.enterRoom(
      selectedMode,
      chat.prepareConnection,
    );
  }

  function handleLeaveRoom(): void {
    chat.reset();
    room.leaveRoom();
  }

  const showGuide =
    !showSplash &&
    !room.participant &&
    !room.joining &&
    supported &&
    !connected &&
    !connecting &&
    presence.checked &&
    !presence.remoteConnected &&
    !sheetOpen &&
    !guideDismissed;

  // 상단에 보여 줄 기기 상태: 내 연결이 우선, 없으면 다른 휴대폰의 연결
  const deviceForHeader = connected
    ? { connected: true, serialNumber: earLink.serialNumber }
    : { connected: presence.remoteConnected, serialNumber: presence.remoteSerialNumber };

  return (
    <MobileAppShell>
      {showSplash ? (
        <IntroSplash />
      ) : room.participant ? (
        <ChatScreen
          participant={room.participant}
          messages={chat.messages}
          brailleTyping={[
            ...chat.brailleTyping,
            // 이 휴대폰이 중계하는 점자 사용자도 화면 사용자의 상대방이다.
            ...(brailleDraft !== null ? [{
              senderId: room.participant.participant_id,
              content: brailleDraft,
            }] : []),
          ]}
          chatConnected={chat.connected}
          chatStatus={chat.status}
          chatErrorMessage={chat.errorMessage}
          earLink={earLink}
          device={deviceForHeader}
          onDevicePress={handleDevicePress}
          onLeave={handleLeaveRoom}
          onSendMessage={chat.sendMessage}
          onClearError={chat.clearError}
        />
      ) : (
        <ModeSelectScreen
          loading={room.joining}
          errorMessage={room.joinError}
          onSelectMode={handleSelectMode}
          device={{ ...earLink, remoteConnected: presence.remoteConnected }}
          showGuide={showGuide}
          onDevicePress={handleDevicePress}
          onDismissGuide={dismissGuide}
        />
      )}

      <DeviceConnectSheet
        open={sheetOpen}
        supported={supported}
        connected={connected}
        connecting={connecting}
        deviceName={earLink.deviceName}
        serialNumber={earLink.serialNumber}
        remoteConnected={presence.remoteConnected}
        remoteSerialNumber={presence.remoteSerialNumber}
        error={earLink.error}
        status={earLink.status}
        onControl={earLink.control}
        onIntervalChange={earLink.setIntervalMs}
        onConnect={handleConnect}
        onDisconnect={earLink.disconnect}
        onClose={closeSheet}
      />
    </MobileAppShell>
  );
}
