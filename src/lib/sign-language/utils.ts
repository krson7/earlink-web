export function isCompleteKoreanSyllable(character: string): boolean {
  const code = character.codePointAt(0);

  if (code === undefined) {
    return false;
  }

  return code >= 0xac00 && code <= 0xd7a3;
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return error instanceof Error
      ? error.message
      : "알 수 없는 오류가 발생했습니다.";
  }

  switch (error.name) {
    case "NotAllowedError":
      return (
        "카메라 권한이 거부되었습니다. " +
        "브라우저에서 카메라를 허용해 주세요."
      );

    case "NotReadableError":
    case "AbortError":
      return (
        "카메라를 시작할 수 없습니다. " +
        "카메라를 사용하는 다른 앱을 종료해 주세요."
      );

    case "NotFoundError":
      return "사용 가능한 카메라를 찾지 못했습니다.";

    default:
      return error.message;
  }
}