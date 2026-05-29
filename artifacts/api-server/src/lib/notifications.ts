interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
}

export async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
  const valid = messages.filter((m) => m.to && m.to.startsWith("ExponentPushToken["));
  if (!valid.length) return;

  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(valid),
    });
  } catch {
  }
}
