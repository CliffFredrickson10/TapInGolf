import { exec } from "./pg";

export async function saveUserNotification(
  userId: number,
  type: string,
  title: string,
  body: string,
  data: Record<string, any> = {}
): Promise<void> {
  try {
    await exec(
      `INSERT INTO user_notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, body, JSON.stringify(data)]
    );
  } catch {}
}
